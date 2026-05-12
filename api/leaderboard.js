/**
 * api/leaderboard.js
 * GET  /api/leaderboard?limit=10&season=id  → public leaderboard
 * POST /api/leaderboard                     → submit score
 */
import { kv } from '../lib/kv.js';
import { emailHash } from '../lib/crypto.js';
import { validateEmail, censorEmail } from '../lib/email.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'https://gon-jump-game.vercel.app';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ─── Build display rows from a sorted set ────────────────────────────────────
// Upstash zrange withScores returns alternating [member, score, member, score, ...]
async function buildRows(members) {
  if (!members || members.length === 0) return [];
  const rows = [];
  let rank = 1;
  for (let i = 0; i < members.length; i += 2) {
    const hash  = members[i];
    const score = Number(members[i + 1]);
    if (!hash || score <= 0) continue;
    const profile = await kv.hgetall(`profile:${hash}`);
    if (!profile) continue;
    rows.push({
      rank,
      name:         profile.name         ?? 'Anonymous',
      emailDisplay: profile.emailDisplay  ?? '****',
      score,
    });
    rank++;
  }
  return rows;
}

// ─── GET /api/leaderboard ────────────────────────────────────────────────────
async function handleGet(req, res) {
  const limit = Math.min(parseInt(req.query?.limit ?? '10', 10), 100);

  // Season-aware key
  const activeId = await kv.get('season:active');
  const seasonId = req.query?.season ?? activeId ?? null;
  const lbKey    = seasonId ? `leaderboard:season:${seasonId}` : 'leaderboard:global';

  const members = await kv.zrange(lbKey, 0, limit - 1, { rev: true, withScores: true });

  // Season list for dropdown
  const rawSeasons = await kv.zrange('season:list', 0, -1, { rev: true, withScores: true });
  const seasons = [];
  for (let i = 0; i < rawSeasons.length; i += 2) {
    const sid  = rawSeasons[i];
    const info = await kv.hgetall(`season:${sid}`);
    seasons.push({ id: sid, name: info?.name ?? sid, createdAt: Number(rawSeasons[i + 1]) });
  }

  const global = await buildRows(members);

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  return res.status(200).json({ global, daily: [], seasonId, activeSeason: activeId, seasons });
}

// ─── POST /api/leaderboard ───────────────────────────────────────────────────
async function handlePost(req, res) {
  const {
    score: rawScore,
    level: rawLevel,
    email,
    name: rawName,
    seasonId: explicitSeasonId,  // optional: event-specific season override
  } = req.body ?? {};

  // Basic validation
  if (rawScore == null || !email) {
    return res.status(400).json({ error: 'Missing required fields (score, email).' });
  }

  const score = parseInt(rawScore, 10);
  const level = parseInt(rawLevel ?? '1', 10);

  if (isNaN(score) || score < 0) {
    return res.status(400).json({ error: 'Invalid score.' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }

  // Hash email → used as unique Redis key (keeps leaderboard deduplicated)
  const hash         = await emailHash(email);
  const emailDisplay = censorEmail(email);
  const name         = (rawName ?? 'Anonymous').trim().slice(0, 20) || 'Anonymous';
  const now          = Date.now();

  // Determine season → explicit event seasonId takes priority over active season
  const activeSeason = explicitSeasonId ?? (await kv.get('season:active'));
  const lbKey = activeSeason ? `leaderboard:season:${activeSeason}` : 'leaderboard:global';

  // Write to sorted set (GT: only update if higher score)
  await kv.zadd(lbKey, { gt: true }, { member: hash, score });

  // Update profile
  const prevBestScore = Number(await kv.hget(`profile:${hash}`, 'bestScore') ?? 0);
  const prevBestLevel = Number(await kv.hget(`profile:${hash}`, 'bestLevel') ?? 1);
  await kv.hset(`profile:${hash}`, {
    email,              // stored securely, never exposed via API
    emailDisplay,       // censored version shown on leaderboard
    name,
    bestScore:   Math.max(score, prevBestScore),
    bestLevel:   Math.max(level, prevBestLevel),
    lastPlayedAt: now,
    consentedAt:  now,
  });
  await kv.hincrby(`profile:${hash}`, 'timesPlayed', 1);

  // Score history
  await kv.lpush(`profile:${hash}:history`, JSON.stringify({ score, level, name, ts: now }));
  await kv.ltrim(`profile:${hash}:history`, 0, 199);

  // Rank
  const zeroRank     = await kv.zrevrank(lbKey, hash);
  const rank         = zeroRank != null ? zeroRank + 1 : null;
  const totalEntries = await kv.zcard(lbKey);

  return res.status(200).json({ ok: true, rank, totalEntries, emailDisplay, name });
}

// ─── Router ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    if (req.method === 'GET')  return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[leaderboard]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
