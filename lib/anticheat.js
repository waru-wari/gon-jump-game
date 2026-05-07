/**
 * lib/anticheat.js
 * Multi-layer anti-cheat validation for POST /api/leaderboard.
 * All checks return { ok: boolean, status?: number, error?: string }.
 */
import { hmacVerify } from './crypto.js';

/**
 * 1. Session age — must be > 30 s (prevents instant-submit bots)
 *    and < 30 min (session TTL)
 *
 * @param {{ createdAt: number }} session   KV session hash (createdAt = unix ms)
 * @returns {{ ok: boolean, status?: number, error?: string }}
 */
export function checkSessionAge(session) {
  const age = Date.now() - Number(session.createdAt);
  if (age < 30_000) {
    return { ok: false, status: 429, error: 'Submit too fast — play a little longer.' };
  }
  if (age > 30 * 60 * 1000) {
    return { ok: false, status: 401, error: 'Session expired.' };
  }
  return { ok: true };
}

/**
 * 2. Score sanity — reject scores > currentMax × 1.5 + 1000.
 *    Reads the current global max from a dedicated KV key that is updated
 *    atomically when a new max is written.
 *
 * @param {number} score
 * @param {import('@upstash/redis').Redis} kv
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function checkScoreSanity(score, kv) {
  const rawMax = await kv.get('leaderboard:global:max');
  const currentMax = rawMax ? Number(rawMax) : 0;
  const ceiling = Math.max(currentMax * 1.5 + 1000, 5000); // floor at 5000 for fresh boards
  if (score > ceiling) {
    return { ok: false, status: 422, error: 'Score rejected by sanity check.' };
  }
  return { ok: true };
}

/**
 * 3. HMAC signature — verify score|level|sessionToken was signed with SESSION_HMAC_SECRET.
 *    Prevents client-side score tampering.
 *
 * @param {number|string} score
 * @param {number|string} level
 * @param {string} sessionToken
 * @param {string} sig           hex HMAC from client
 * @param {string} secret        SESSION_HMAC_SECRET env var
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function verifyScoreSig(score, level, sessionToken, sig, secret) {
  const data = `${score}|${level}|${sessionToken}`;
  const valid = await hmacVerify(data, sig, secret);
  if (!valid) {
    return { ok: false, status: 403, error: 'Invalid score signature.' };
  }
  return { ok: true };
}

/**
 * 4. Rate limit — max 12 submissions per IP per 60 s.
 *    Uses INCR + conditional EXPIRE (set TTL only on first hit).
 *
 * @param {string} ip
 * @param {import('@upstash/redis').Redis} kv
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function checkRateLimit(ip, kv) {
  const key = `rate:${ip}`;
  const count = await kv.incr(key);
  if (count === 1) await kv.expire(key, 60);
  if (count > 12) {
    return { ok: false, status: 429, error: 'Rate limit exceeded. Try again later.' };
  }
  return { ok: true };
}

/**
 * Run all anti-cheat checks in sequence.
 * Returns on the FIRST failure so error messages are unambiguous.
 *
 * @param {{
 *   session: object,
 *   score: number,
 *   level: number,
 *   sessionToken: string,
 *   scoreSig: string,
 *   ip: string,
 *   kv: import('@upstash/redis').Redis,
 * }} params
 * @returns {Promise<{ ok: boolean, status?: number, error?: string }>}
 */
export async function runAllChecks({ session, score, level, sessionToken, scoreSig, ip, kv }) {
  const secret = process.env.SESSION_HMAC_SECRET;

  // Already submitted?
  if (session.submitted) {
    return { ok: false, status: 409, error: 'Score already submitted for this session.' };
  }

  const ageCheck = checkSessionAge(session);
  if (!ageCheck.ok) return ageCheck;

  const sigCheck = await verifyScoreSig(score, level, sessionToken, scoreSig, secret);
  if (!sigCheck.ok) return sigCheck;

  const sanityCheck = await checkScoreSanity(score, kv);
  if (!sanityCheck.ok) return sanityCheck;

  const rateCheck = await checkRateLimit(ip, kv);
  if (!rateCheck.ok) return rateCheck;

  return { ok: true };
}
