import { getRedis, redisReady } from './redis.client';

const ttl = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

export const CACHE_TTL = {
  categories: ttl('CACHE_CATEGORIES_TTL_SECONDS', 3600),
  trending: ttl('CACHE_TRENDING_TTL_SECONDS', 60),
  creatorProfile: ttl('CACHE_CREATOR_PROFILE_TTL_SECONDS', 300),
  related: ttl('CACHE_RELATED_TTL_SECONDS', 300),
};

/**
 * Cache-aside: Redis HIT -> return; MISS -> load from the DB, store with a TTL, return.
 * Any Redis problem is swallowed and the loader result is returned, so correctness never depends on Redis.
 * Concurrent misses in this process share one loader call (cheap stampede protection).
 */
const inflight = new Map<string, Promise<unknown>>();

export const cached = async <T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> => {
  const redis = getRedis();
  if (!redis || !redisReady()) return load();

  try {
    const hit = await redis.get(key);
    if (hit !== null) return JSON.parse(hit) as T;
  } catch {
    return load();
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const p = (async () => {
    const value = await load();
    try {
      // JSON round-trips BigInt via the global toJSON installed in app.ts
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      /* cache write failed: harmless */
    }
    return value;
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
};

/** Delete cached keys (exact names, or a prefix ending in "*"). Failures are ignored; the TTL still bounds staleness. */
export const invalidate = async (...patterns: string[]) => {
  const redis = getRedis();
  if (!redis || !redisReady()) return;
  try {
    for (const pattern of patterns) {
      if (!pattern.endsWith('*')) {
        await redis.del(pattern);
        continue;
      }
      let cursor = '0';
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = next;
        if (keys.length) await redis.del(...keys);
      } while (cursor !== '0');
    }
  } catch {
    /* ignore */
  }
};
