/**
 * api/leaderboard-skip.js
 * POST /api/leaderboard/skip
 *
 * Called when the player clicks [SKIP] on the post-game submit panel.
 * Marks the session as skipped so it cannot be used to submit later.
 * No PII is accepted or stored.
 *
 * Body: { sessionToken: string }
 * Response: { ok: true }
 */
import { kv } from '../lib/kv.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'https://gon-jump-game.vercel.app';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { sessionToken } = req.body ?? {};

    if (!sessionToken || typeof sessionToken !== 'string') {
      return res.status(400).json({ error: 'Missing sessionToken.' });
    }

    // Only update if session exists and hasn't been used yet
    const session = await kv.hgetall(`session:${sessionToken}`);
    if (!session) {
      // Session already expired — treat as success (idempotent)
      return res.status(200).json({ ok: true });
    }

    if (!session.submitted) {
      await kv.hset(`session:${sessionToken}`, { submitted: 'skip' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[leaderboard-skip]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
