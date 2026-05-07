/**
 * lib/kv.js
 * Upstash Redis client — reads KV_REST_API_URL + KV_REST_API_TOKEN from env.
 * Exported as a singleton so the connection is reused across invocations in the
 * same Vercel function container.
 */
import { Redis } from '@upstash/redis';

export const kv = Redis.fromEnv();
