/**
 * api/leaderboard-admin.js
 * POST /api/leaderboard-admin
 *
 * Token-gated admin API. Token is validated via constant-time comparison against
 * ADMIN_RESET_TOKEN env var. Token MUST be passed in the x-admin-token header —
 * never in the URL, never in the body.
 *
 * Supported actions:
 *   status   → { ok: true, totalEntries }
 *   top100   → { entries: [...] }         full PII (admin only)
 *   search   → { entry } | { entry: null }
 *   delete   → { ok: true, removed: bool }
 *   reset    → { ok: true, deleted: number }
 *   export   → { entries: [...] }         full PII dump for backup
 */
import { kv } from '../lib/kv.js';
import { emailHash } from '../lib/crypto.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'https://gon-jump-game.vercel.app';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
}

// Constant-time string comparison to prevent timing attacks on the admin token
function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function unauthorized(res) {
  return res.status(401).json({ error: 'Unauthorized.' });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getTopN(n) {
  const members = await kv.zrange('leaderboard:global', 0, n - 1, {
    rev: true,
    withScores: true,
  });
  if (!members || members.length === 0) return [];

  return Promise.all(
    members.map(async ({ member: hash, score }, i) => {
      const profile = await kv.hgetall(`profile:${hash}`);
      return {
        rank: i + 1,
        hash,
        name: profile?.name ?? 'Anonymous',
        emailDisplay: profile?.emailDisplay ?? '****',
        score: Number(score),
        bestLevel: profile?.bestLevel ?? 1,
        timesPlayed: Number(profile?.timesPlayed ?? 1),
        lastPlayedAt: profile?.lastPlayedAt ?? null,
        consentedAt: profile?.consentedAt ?? null,
      };
    }),
  );
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function actionStatus(res) {
  const totalEntries = await kv.zcard('leaderboard:global');
  return res.status(200).json({ ok: true, totalEntries });
}

async function actionTop100(res) {
  const entries = await getTopN(100);
  return res.status(200).json({ entries });
}

async function actionSearch(body, res) {
  const { email } = body;
  if (!email) return res.status(400).json({ error: 'email required.' });

  const hash = await emailHash(email);
  const profile = await kv.hgetall(`profile:${hash}`);
  const score = await kv.zscore('leaderboard:global', hash);

  if (!profile) return res.status(200).json({ entry: null });

  return res.status(200).json({
    entry: {
      hash,
      name: profile.name ?? 'Anonymous',
      emailDisplay: profile.emailDisplay ?? '****',
      score: score ? Number(score) : 0,
      bestLevel: profile.bestLevel ?? 1,
      timesPlayed: Number(profile.timesPlayed ?? 1),
      lastPlayedAt: profile.lastPlayedAt ?? null,
      consentedAt: profile.consentedAt ?? null,
    },
  });
}

async function actionDelete(body, res) {
  const { email } = body;
  if (!email) return res.status(400).json({ error: 'email required.' });

  const hash = await emailHash(email);

  // Remove from sorted sets + profile
  const removed = await kv.zrem('leaderboard:global', hash);
  const today = new Date().toISOString().slice(0, 10);
  await kv.zrem(`leaderboard:daily:${today}`, hash);
  await kv.del(`profile:${hash}`);
  await kv.del(`profile:${hash}:history`);

  return res.status(200).json({ ok: true, removed: removed > 0 });
}

async function actionReset(res) {
  // Count before delete for the audit log
  const deleted = await kv.zcard('leaderboard:global');
  await kv.del('leaderboard:global');
  await kv.del('leaderboard:global:max');
  // Daily boards have their own TTL so we don't enumerate them
  return res.status(200).json({ ok: true, deleted });
}

async function actionExport(res) {
  // Full PII dump — treat as sensitive; admin should store securely
  const entries = await getTopN(1000);
  res.setHeader('Content-Disposition', 'attachment; filename="leaderboard-export.json"');
  return res.status(200).json({ entries });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Token check — header only, constant-time
  const token = req.headers['x-admin-token'] ?? '';
  const expected = process.env.ADMIN_RESET_TOKEN ?? '';
  if (!expected || !safeEqual(token, expected)) return unauthorized(res);

  const { action, ...body } = req.body ?? {};

  try {
    switch (action) {
      case 'status': return await actionStatus(res);
      case 'top100': return await actionTop100(res);
      case 'search': return await actionSearch(body, res);
      case 'delete': return await actionDelete(body, res);
      case 'reset':  return await actionReset(res);
      case 'export': return await actionExport(res);
      default:       return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[leaderboard-admin]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
