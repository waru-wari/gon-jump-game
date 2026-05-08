/**
 * api/leaderboard-admin.js
 * POST /api/leaderboard-admin  (x-admin-token header required)
 *
 * Actions:
 *   status         → { ok, totalEntries, activeSeasonId, activeSeasonName }
 *   seasons        → { seasons: [{id, name, createdAt, isActive, playerCount}], activeId }
 *   createSeason   → { ok, id, name }
 *   setActive      → { ok, activeId }
 *   resetSeason    → { ok, deleted, seasonId }
 *   players        → { entries, seasonId }
 *   top100         → { entries }   (optional seasonId in body)
 *   search         → { entry }
 *   delete         → { ok, removed }
 *   export         → { entries }
 */
import { kv } from '../lib/kv.js';
import { emailHash } from '../lib/crypto.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'https://gon-jump-game.vercel.app';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function unauthorized(res) { return res.status(401).json({ error: 'Unauthorized.' }); }

// ─── Season helpers ───────────────────────────────────────────────────────────

async function getActiveSeason() {
  return kv.get('season:active');
}

function seasonKey(id) { return `leaderboard:season:${id}`; }

// ─── Shared: fetch top-N entries from a season (or legacy global key) ─────────
// Upstash zrange withScores returns alternating [member, score, member, score, ...]
async function getTopN(n, sid) {
  const key = sid ? seasonKey(sid) : (await getActiveSeason().then(a => a ? seasonKey(a) : 'leaderboard:global'));
  const members = await kv.zrange(key, 0, n - 1, { rev: true, withScores: true });
  if (!members || members.length === 0) return [];
  const entries = [];
  for (let i = 0; i < members.length; i += 2) {
    const hash  = members[i];
    const score = Number(members[i + 1]);
    if (!hash || score <= 0) continue;
    const profile = await kv.hgetall(`profile:${hash}`);
    entries.push({
      rank: entries.length + 1,
      hash,
      name:         profile?.name         ?? 'Anonymous',
      emailDisplay: profile?.email ?? profile?.emailDisplay ?? '****',
      score,
      bestLevel:    profile?.bestLevel     ?? 1,
      timesPlayed:  Number(profile?.timesPlayed ?? 1),
      lastPlayedAt: profile?.lastPlayedAt  ?? null,
      consentedAt:  profile?.consentedAt   ?? null,
    });
  }
  return entries;
}

// ─── Season list helper ───────────────────────────────────────────────────────
async function listSeasons() {
  const raw = await kv.zrange('season:list', 0, -1, { rev: true, withScores: true });
  const activeId = await getActiveSeason();
  const seasons = [];
  for (let i = 0; i < raw.length; i += 2) {
    const id   = raw[i];
    const ts   = Number(raw[i + 1]);
    const info = await kv.hgetall(`season:${id}`);
    const playerCount = await kv.zcard(seasonKey(id));
    seasons.push({
      id,
      name:        info?.name ?? id,
      createdAt:   ts,
      isActive:    id === activeId,
      playerCount,
    });
  }
  return { seasons, activeId };
}

// ─── Action handlers ──────────────────────────────────────────────────────────

async function actionStatus(res) {
  const activeId  = await getActiveSeason();
  const key       = activeId ? seasonKey(activeId) : 'leaderboard:global';
  const totalEntries = await kv.zcard(key);
  let activeName = null;
  if (activeId) {
    const info = await kv.hgetall(`season:${activeId}`);
    activeName = info?.name ?? activeId;
  }
  return res.status(200).json({ ok: true, totalEntries, activeSeasonId: activeId, activeSeasonName: activeName });
}

async function actionSeasons(res) {
  const result = await listSeasons();
  return res.status(200).json(result);
}

async function actionCreateSeason(body, res) {
  const name = (body.name ?? '').trim();
  if (!name) return res.status(400).json({ error: 'Season name required.' });
  const id  = `s_${Date.now()}`;
  const now = Date.now();
  await kv.zadd('season:list', { score: now, member: id });
  await kv.hset(`season:${id}`, { name, createdAt: now });
  // Auto-activate if it's the first season
  const current = await getActiveSeason();
  if (!current) await kv.set('season:active', id);
  return res.status(200).json({ ok: true, id, name });
}

async function actionSetActive(body, res) {
  const { seasonId } = body;
  if (!seasonId) return res.status(400).json({ error: 'seasonId required.' });
  const exists = await kv.hgetall(`season:${seasonId}`);
  if (!exists) return res.status(404).json({ error: 'Season not found.' });
  await kv.set('season:active', seasonId);
  return res.status(200).json({ ok: true, activeId: seasonId });
}

async function actionResetSeason(body, res) {
  const { seasonId } = body;
  if (!seasonId) return res.status(400).json({ error: 'seasonId required.' });
  const key = seasonKey(seasonId);
  const deleted = await kv.zcard(key);
  await kv.del(key);
  await kv.del(`${key}:max`);
  return res.status(200).json({ ok: true, deleted, seasonId });
}

async function actionPlayers(body, res) {
  const limit = Math.min(parseInt(body.limit ?? '100', 10), 500);
  const entries = await getTopN(limit, body.seasonId);
  return res.status(200).json({ entries, seasonId: body.seasonId ?? null });
}

async function actionTop100(body, res) {
  const entries = await getTopN(100, body.seasonId);
  return res.status(200).json({ entries });
}

async function actionSearch(body, res) {
  const { email } = body;
  if (!email) return res.status(400).json({ error: 'email required.' });

  const hash = await emailHash(email);
  const profile = await kv.hgetall(`profile:${hash}`);

  // Find score in active season (or legacy global)
  const activeId  = await getActiveSeason();
  const key       = activeId ? seasonKey(activeId) : 'leaderboard:global';
  const score     = await kv.zscore(key, hash);

  if (!profile) return res.status(200).json({ entry: null });

  return res.status(200).json({
    entry: {
      hash,
      name:         profile.name         ?? 'Anonymous',
      emailDisplay: profile.email ?? profile.emailDisplay ?? '****',
      score:        score ? Number(score) : 0,
      bestLevel:    profile.bestLevel     ?? 1,
      timesPlayed:  Number(profile.timesPlayed ?? 1),
      lastPlayedAt: profile.lastPlayedAt  ?? null,
      consentedAt:  profile.consentedAt   ?? null,
    },
  });
}

async function actionDelete(body, res) {
  const { email, seasonId } = body;
  if (!email) return res.status(400).json({ error: 'email required.' });

  const hash = await emailHash(email);
  // Remove from specified season, or active season
  const activeId = seasonId ?? (await getActiveSeason());
  const key = activeId ? seasonKey(activeId) : 'leaderboard:global';
  const removed = await kv.zrem(key, hash);
  // Keep profile for cross-season history (don't delete unless specifically requested)
  return res.status(200).json({ ok: true, removed: removed > 0 });
}

async function actionExport(body, res) {
  const entries = await getTopN(1000, body.seasonId);
  res.setHeader('Content-Disposition', 'attachment; filename="leaderboard-export.json"');
  return res.status(200).json({ entries });
}

// ─── Router ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token    = req.headers['x-admin-token'] ?? '';
  const expected = process.env.ADMIN_RESET_TOKEN ?? '';
  if (!expected || !safeEqual(token, expected)) return unauthorized(res);

  const { action, ...body } = req.body ?? {};

  try {
    switch (action) {
      case 'status':        return await actionStatus(res);
      case 'seasons':       return await actionSeasons(res);
      case 'createSeason':  return await actionCreateSeason(body, res);
      case 'setActive':     return await actionSetActive(body, res);
      case 'resetSeason':   return await actionResetSeason(body, res);
      case 'players':       return await actionPlayers(body, res);
      case 'top100':        return await actionTop100(body, res);
      case 'search':        return await actionSearch(body, res);
      case 'delete':        return await actionDelete(body, res);
      case 'export':        return await actionExport(body, res);
      default:              return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error('[leaderboard-admin]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
