import { getRedis, redisReady } from '../cache/redis.client';

/**
 * Distributed token bucket. The refill + check + consume steps run in ONE Lua script, so two API replicas
 * can never spend the same token. Returns whether the request is allowed.
 * KEYS[1]=bucket key; ARGV = capacity, refillPerSecond, cost, nowMs
 */
const SCRIPT = `
local cap = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now = tonumber(ARGV[4])
local b = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(b[1])
local ts = tonumber(b[2])
if tokens == nil then tokens = cap; ts = now end
tokens = math.min(cap, tokens + math.max(0, now - ts) / 1000 * rate)
local allowed = 0
local retry = 0
if tokens >= cost then tokens = tokens - cost; allowed = 1
else retry = math.ceil((cost - tokens) / rate * 1000) end
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('PEXPIRE', KEYS[1], math.ceil(cap / rate * 1000) + 1000)
return {allowed, retry}
`;

export const CAPACITY = Number(process.env.TOKEN_BUCKET_GLOBAL_CAPACITY ?? 100);
export const REFILL_PER_SECOND = Number(process.env.TOKEN_BUCKET_GLOBAL_REFILL_PER_SECOND ?? 10);

/** Fails OPEN (allows) when Redis is unavailable; the in-memory express-rate-limit layer still applies. */
export const consumeTokens = async (
  key: string,
  cost = 1,
): Promise<{ allowed: boolean; retryAfterMs: number }> => {
  const redis = getRedis();
  if (!redis || !redisReady()) return { allowed: true, retryAfterMs: 0 };
  try {
    const [allowed, retry] = (await redis.eval(SCRIPT, 1, key, CAPACITY, REFILL_PER_SECOND, cost, Date.now())) as [number, number];
    return { allowed: allowed === 1, retryAfterMs: retry };
  } catch {
    return { allowed: true, retryAfterMs: 0 };
  }
};
