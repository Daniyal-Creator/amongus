import { getCache } from "./cache.js";
import { config } from "../config.js";

/**
 * Rate-limit helper. Backed by Redis when available, otherwise in-memory.
 * Returns { allowed, remaining, resetSeconds }.
 */
export async function rateLimit(
  bucket: string,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetSeconds: number }> {
  const cache = await getCache();
  const cacheKey = `rl:${bucket}:${key}:${Math.floor(Date.now() / 1000 / windowSeconds)}`;
  const count = await cache.incrWithTtl(cacheKey, windowSeconds);
  const remaining = Math.max(0, max - count);
  return {
    allowed: count <= max,
    remaining,
    resetSeconds: windowSeconds,
  };
}

export async function chatRateLimit(playerId: string) {
  return rateLimit("chat", playerId, config.chatRateLimitPer10s, 10);
}

export async function aiRateLimit(playerId: string) {
  return rateLimit("ai", playerId, config.aiRateLimitPerMinute, 60);
}
