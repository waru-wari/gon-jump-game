/**
 * api/event.js
 * GET  /api/event?slug=<slug>   → { seasonId, name } or 404
 * POST /api/event               → admin actions (x-admin-token required)
 *   createLink  → { ok, slug, seasonId }
 *   deleteLink  → { ok }
 *   listLinks   → { links: [{slug, seasonId, name, createdAt}] }
 *
 * This maps a short URL slug (e.g. "event-may-2025") to an existing seasonId.
 * The game client reads ?event=<slug> from the URL and passes it to the leaderboard API.
 */
import { kv } from '../lib/kv.js';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'https://gon-jump-game.vercel.app';

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-admin-token');
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ─── GET /api/event?slug=xxx ───────────────────────────────────────────────────
// Public — resolves slug to seasonId (no auth needed)
async function handleGet(req, res) {
  const slug = (req.query?.slug ?? '').trim().toLowerCase();
  if (!slug) return res.status(400).json({ error: 'slug required.' });

  const link = await kv.hgetall(`event:slug:${slug}`);
  if (!link) return res.status(404).json({ error: 'Event not found.' });

  // Optionally look up season name
  const seasonInfo = link.seasonId ? await kv.hgetall(`season:${link.seasonId}`) : null;
  return res.status(200).json({
    slug,
    seasonId: link.seasonId,
    name: link.name ?? seasonInfo?.name ?? slug,
    createdAt: link.createdAt ? Number(link.createdAt) : null,
  });
}

// ─── POST /api/event (admin) ────────────────────────────────────────────────────
async function handlePost(req, res) {
  const token    = req.headers['x-admin-token'] ?? '';
  const expected = process.env.ADMIN_RESET_TOKEN ?? '';
  if (!expected || !safeEqual(token, expected)) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const { action, ...body } = req.body ?? {};

  switch (action) {
    case 'createLink': {
      const { slug: rawSlug, seasonId, name } = body;
      const slug = (rawSlug ?? '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
      if (!slug || !seasonId) return res.status(400).json({ error: 'slug and seasonId required.' });
      const seasonExists = await kv.hgetall(`season:${seasonId}`);
      if (!seasonExists) return res.status(404).json({ error: 'Season not found.' });
      const now = Date.now();
      await kv.hset(`event:slug:${slug}`, { seasonId, name: name ?? slug, createdAt: now });
      // Track all slugs in a set for listLinks
      await kv.sadd('event:slugs', slug);
      return res.status(200).json({ ok: true, slug, seasonId, name: name ?? slug });
    }

    case 'deleteLink': {
      const { slug: rawSlug } = body;
      const slug = (rawSlug ?? '').trim().toLowerCase();
      if (!slug) return res.status(400).json({ error: 'slug required.' });
      await kv.del(`event:slug:${slug}`);
      await kv.srem('event:slugs', slug);
      return res.status(200).json({ ok: true });
    }

    case 'listLinks': {
      const slugs = await kv.smembers('event:slugs') ?? [];
      const links = await Promise.all(
        slugs.map(async (slug) => {
          const link = await kv.hgetall(`event:slug:${slug}`);
          if (!link) return null;
          const seasonInfo = link.seasonId ? await kv.hgetall(`season:${link.seasonId}`) : null;
          return {
            slug,
            seasonId: link.seasonId,
            name: link.name ?? slug,
            seasonName: seasonInfo?.name ?? link.seasonId,
            createdAt: link.createdAt ? Number(link.createdAt) : null,
          };
        })
      );
      return res.status(200).json({ links: links.filter(Boolean) });
    }

    default:
      return res.status(400).json({ error: `Unknown action: ${action}` });
  }
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
    console.error('[event]', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
