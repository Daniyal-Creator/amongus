import { config } from "../config.js";

type Entry = { value: string; expiresAt: number | null };

interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  incrWithTtl(key: string, ttlSeconds: number): Promise<number>;
}

class MemoryCache implements CacheClient {
  private store = new Map<string, Entry>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const raw = await this.get(key);
    const next = (raw ? Number(raw) : 0) + 1;
    await this.set(key, String(next), ttlSeconds);
    return next;
  }
}

class RedisCache implements CacheClient {
  constructor(private redis: any) {}

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.set(key, value, "EX", ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const next = await this.redis.incr(key);
    if (next === 1) {
      await this.redis.expire(key, ttlSeconds);
    }
    return next;
  }
}

let cacheClient: CacheClient | null = null;

export async function getCache(): Promise<CacheClient> {
  if (cacheClient) return cacheClient;
  if (!config.redisUrl) {
    cacheClient = new MemoryCache();
    return cacheClient;
  }
  try {
    // dynamic, untyped import so tsc doesn't require ioredis types when the dep isn't installed
    const mod: any = await import(/* @vite-ignore */ "ioredis" as string);
    const Redis = mod.default ?? mod;
    const client = new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 1 });
    client.on("error", (err: Error) => {
      // eslint-disable-next-line no-console
      console.warn("[redis] error, falling back to in-memory:", err.message);
    });
    cacheClient = new RedisCache(client);
    return cacheClient;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[redis] not available, using in-memory cache");
    cacheClient = new MemoryCache();
    return cacheClient;
  }
}
