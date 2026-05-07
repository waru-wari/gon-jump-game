/**
 * lib/kv.js
 * Upstash Redis client — Vercel KV uses KV_REST_API_URL / KV_REST_API_TOKEN.
 * (Redis.fromEnv() looks for UPSTASH_REDIS_REST_URL which is a different naming convention)
 */
import { Redis } from '@upstash/redis';

export const kv = new Redis({
  url:   process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
