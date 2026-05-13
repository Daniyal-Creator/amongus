import { config } from "../config.js";
class MemoryCache {
    store = new Map();
    async get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return null;
        if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
            this.store.delete(key);
            return null;
        }
        return entry.value;
    }
    async set(key, value, ttlSeconds) {
        const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
        this.store.set(key, { value, expiresAt });
    }
    async del(key) {
        this.store.delete(key);
    }
    async incrWithTtl(key, ttlSeconds) {
        const raw = await this.get(key);
        const next = (raw ? Number(raw) : 0) + 1;
        await this.set(key, String(next), ttlSeconds);
        return next;
    }
}
class RedisCache {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    async get(key) {
        return this.redis.get(key);
    }
    async set(key, value, ttlSeconds) {
        if (ttlSeconds) {
            await this.redis.set(key, value, "EX", ttlSeconds);
        }
        else {
            await this.redis.set(key, value);
        }
    }
    async del(key) {
        await this.redis.del(key);
    }
    async incrWithTtl(key, ttlSeconds) {
        const next = await this.redis.incr(key);
        if (next === 1) {
            await this.redis.expire(key, ttlSeconds);
        }
        return next;
    }
}
let cacheClient = null;
export async function getCache() {
    if (cacheClient)
        return cacheClient;
    if (!config.redisUrl) {
        cacheClient = new MemoryCache();
        return cacheClient;
    }
    try {
        // dynamic, untyped import so tsc doesn't require ioredis types when the dep isn't installed
        const mod = await import(/* @vite-ignore */ "ioredis");
        const Redis = mod.default ?? mod;
        const client = new Redis(config.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 1 });
        client.on("error", (err) => {
            // eslint-disable-next-line no-console
            console.warn("[redis] error, falling back to in-memory:", err.message);
        });
        cacheClient = new RedisCache(client);
        return cacheClient;
    }
    catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[redis] not available, using in-memory cache");
        cacheClient = new MemoryCache();
        return cacheClient;
    }
}
