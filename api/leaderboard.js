/**
 * api/leaderboard.js
 * GET  /api/leaderboard?limit=20   → public leaderboard (cached 30s at edge)
 * POST /api/leaderboard            → submit score (requires valid session + consent)
 */
import { kv } from '../lib/kv.js';
import { emailHash, hmacSign } from '../lib/crypto.js';
import { validateEmail, censorEmail } from '../lib/email.js';
import { runAllChecks } from '../lib/anticheat.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'https://gon-jump-game.vercel.app';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ─── Today's date as "YYYY-MM-DD" (UTC) ──────────────────────────────────────
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Build display rows from a sorted set (zrange with scores) ───────────────
async function buildRows(members, startRank = 0) {
  if (!members || members.length === 0) return [];
  const rows = [];
  // members from @upstash/redis zrange withScores: [{ member, score }, ...]
  for (let i = 0; i < members.length; i++) {
    const { member: hash, score } = members[i];
    const profile = await kv.hgetall(`profile:${hash}`);
    rows.push({
      rank: startRank + i + 1,
      name: profile?.name ?? 'Anonymous',
      emailDisplay: profile?.emailDisplay ?? '****',
      score: Number(score),
      bestLevel: profile?.bestLevel ?? 1,
      timesPlayed: profile?.timesPlayed ?? 1,
    });
  }
  return rows;
}

// ─── GET /api/leaderboard ────────────────────────────────────────────────────
async function handleGet(req, res) {
  const limit = Math.min(parseInt(req.query?.limit ?? '20', 10), 100);

  // Global board (descending — highest score first)
  const globalMembers = await kv.zrange('leaderboard:global', 0, limit - 1, {
    rev: true,
    withScores: true,
  });

  // Daily board
  const dailyKey = `leaderboard:daily:${todayKey()}`;
  const dailyMembers = await kv.zrange(dailyKey, 0, limit - 1, {
    rev: true,
    withScores: true,
  });

  const [globalRows, dailyRows] = await Promise.all([
    buildRows(globalMembers),
    buildRows(dailyMembers),
  ]);

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  return res.status(200).json({ global: globalRows, daily: dailyRows });
}

// ─── POST /api/leaderboard ───────────────────────────────────────────────────
async function handlePost(req, res) {
  const {
    sessionToken,
    scoreSig,
    score: rawScore,
    level: rawLevel,
    coinsEarned: rawCoins,
    email,
    name: rawName,
    consentedAt,
  } = req.body ?? {};

  // ── Basic field presence ───────────────────────────────────────────────────
  if (!sessionToken || !scoreSig || rawScore == null || !email || !consentedAt) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const score = parseInt(rawScore, 10);
  const level = parseInt(rawLevel ?? '1', 10);
  const coins = parseInt(rawCoins ?? '0', 10);

  if (isNaN(score) || score < 0) {
    return res.status(400).json({ error: 'Invalid score.' });
  }

  // ── Email validation ───────────────────────────────────────────────────────
  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid or disposable email address.' });
  }

  // ── Load session from KV ───────────────────────────────────────────────────
  const session = await kv.hgetall(`session:${sessionToken}`);
  if (!session) {
    return res.status(401).json({ error: 'Session not found or expired.' });
  }

  // ── Client IP ─────────────────────────────────────────────────────────────
  const ip =
    (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  // ── Derive same per-session secret as game-start did ─────────────────────
  const masterSecret = process.env.SESSION_HMAC_SECRET;
  const sessionSecret = await hmacSign(sessionToken, masterSecret);

  // ── Run all anti-cheat checks ─────────────────────────────────────────────
  const check = await runAllChecks({
    session,
    score,
    level,
    sessionToken,
    scoreSig,
    ip,
    kv,
  });
  if (!check.ok) {
    return res.status(check.status).json({ error: check.error });
  }

  // ── Hash email (PDPA — plaintext email dies here) ─────────────────────────
  const hash = await emailHash(email);
  const emailDisplay = censorEmail(email);
  const name = (rawName ?? 'Anonymous').trim().slice(0, 20) || 'Anonymous';
  const now = Date.now();

  // ── KV writes (pipeline for atomicity) ───────────────────────────────────
  const today = todayKey();
  const dailyKey = `leaderboard:daily:${today}`;

  // Global sorted set — GT: only update if new score is higher
  await kv.zadd('leaderboard:global', { gt: true }, { member: hash, score });

  // Update global max tracker (used by score sanity check)
  const currentMax = Number(await kv.get('leaderboard:global:max') ?? 0);
  if (score > currentMax) {
    await kv.set('leaderboard:global:max', score);
  }

  // Daily sorted set (TTL 8 days = 691200s)
  await kv.zadd(dailyKey, { gt: true }, { member: hash, score });
  await kv.expire(dailyKey, 691200);

  // Score history — push snapshot, keep latest 200
  const snapshot = JSON.stringify({ score, level, name, ts: now });
  await kv.lpush(`profile:${hash}:history`, snapshot);
  await kv.ltrim(`profile:${hash}:history`, 0, 199);

  // Profile hash — update live fields
  await kv.hset(`profile:${hash}`, {
    name,
    emailDisplay,
    bestScore: Math.max(score, Number(await kv.hget(`profile:${hash}`, 'bestScore') ?? 0)),
    bestLevel: Math.max(level, Number(await kv.hget(`profile:${hash}`, 'bestLevel') ?? 1)),
    timesPlayed: await kv.hincrby(`profile:${hash}`, 'timesPlayed', 1),
    lastPlayedAt: now,
    consentedAt,
    coins: await kv.hincrby(`profile:${hash}`, 'coins', coins),
  });

  // Mark session as submitted (prevents double-submit)
  await kv.hset(`session:${sessionToken}`, { submitted: 'ok' });

  // ── Compute rank ──────────────────────────────────────────────────────────
  // zrevrank gives 0-indexed position in descending order
  const zeroRank = await kv.zrevrank('leaderboard:global', hash);
  const rank = zeroRank != null ? zeroRank + 1 : null;
  const totalEntries = await kv.zcard('leaderboard:global');

  return res.status(200).json({
    ok: true,
    rank,
    totalEntries,
    emailDisplay,
    name,
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[leaderboard]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
