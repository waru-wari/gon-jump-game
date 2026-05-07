/**
 * api/game-start.js
 * POST /api/game-start
 *
 * Called by the game client at the start of every play session.
 * Returns a signed session token + the HMAC secret the client uses to sign
 * the final score. The sessionSecret is derived (not stored) — only the token
 * is stored in KV so there is nothing sensitive to leak from the database.
 *
 * Response: { sessionToken: string, sessionSecret: string }
 *
 * The client MUST keep sessionSecret in memory only (never localStorage).
 * The client uses it to compute:
 *   scoreSig = HMAC(`${score}|${level}|${sessionToken}`, sessionSecret)
 * before calling POST /api/leaderboard.
 */
import { kv } from '../lib/kv.js';
import { randomToken, hmacSign } from '../lib/crypto.js';

// CORS preflight
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Generate a unique session token
    const sessionToken = randomToken(32);

    // Derive a per-session HMAC secret so each session has a unique signing key.
    // master secret + sessionToken → session-specific secret (never stored in KV).
    const masterSecret = process.env.SESSION_HMAC_SECRET;
    if (!masterSecret) {
      console.error('SESSION_HMAC_SECRET not set');
      return res.status(500).json({ error: 'Server misconfiguration' });
    }
    const sessionSecret = await hmacSign(sessionToken, masterSecret);

    // Get real client IP (Vercel forwards in x-forwarded-for)
    const ip =
      (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() ||
      req.socket?.remoteAddress ||
      'unknown';

    // Store session in KV — TTL 1800s (30 min)
    const sessionData = {
      createdAt: Date.now(),
      ip,
      submitted: '',   // '' = not submitted, 'ok' = submitted, 'skip' = skipped
    };
    await kv.hset(`session:${sessionToken}`, sessionData);
    await kv.expire(`session:${sessionToken}`, 1800);

    return res.status(200).json({ sessionToken, sessionSecret });
  } catch (err) {
    console.error('[game-start]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
