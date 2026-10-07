import Redis from 'ioredis';

/**
 * One shared Redis connection per process. Redis is an OPTIMISATION, never the source of truth:
 * with no REDIS_URL (or while Redis is down) every caller falls back to PostgreSQL / the local limiter.
 */
let client: Redis | null = null;
let lastWarn = 0;

const warn = (message: string) => {
  if (Date.now() - lastWarn < 30_000) return;
  lastWarn = Date.now();
  console.warn(`[redis] ${message}`);
};

export const getRedis = (): Redis | null => {
  const raw = process.env.REDIS_URL?.trim();
  if (!raw) return null;
  if (client) return client;

  // A value pasted without its scheme (":key@host:port") would be treated as a unix-socket path.
  const tls = process.env.REDIS_TLS === 'true' || raw.startsWith('rediss://');
  const url = raw.includes('://') ? raw : `${tls ? 'rediss' : 'redis'}://${raw}`;

  client = new Redis(url, {
    tls: tls ? {} : undefined,
    maxRetriesPerRequest: 1, // fail fast so a dead Redis never stalls API requests
    connectTimeout: 2000,
    commandTimeout: 500,
    enableOfflineQueue: false,
  });
  client.on('error', (e) => warn(`error: ${e.message}`));
  return client;
};

/** True when a Redis connection is configured and currently usable. */
export const redisReady = () => getRedis()?.status === 'ready';
