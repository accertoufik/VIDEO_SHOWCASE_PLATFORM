import { createHash } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { consumeTokens } from '../rate-limit/token-bucket';

// Starting costs (tune from load tests). Anything not listed costs 1. HLS stream requests are skipped.
const costOf = (req: Request): number => {
  const p = req.path;
  const m = req.method;
  if (/\/videos\/[^/]+\/stream\//.test(p)) return 0;
  if (p === '/search' || p === '/api/search') return 2;
  if (m === 'POST' && /\/comments$/.test(p)) return 2;
  if (m === 'POST' && /\/videos\/init$/.test(p)) return 5;
  if (/\/videos\/[^/]+\/download$/.test(p)) return 3;
  return 1;
};

/**
 * Key by the viewer's bearer token when there is one, else by IP. A campus NAT shares one IP, so IP alone
 * would throttle everyone together. (The token is hashed, never stored raw; the express-rate-limit IP
 * limiter stays as the safety net against someone rotating fake tokens.)
 */
const keyOf = (req: Request) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return `user:${createHash('sha1').update(auth.slice(7)).digest('hex').slice(0, 20)}:global`;
  }
  return `ip:${req.ip}:global`;
};

export const tokenBucketLimiter = async (req: Request, res: Response, next: NextFunction) => {
  if (process.env.RATE_LIMIT_DISABLED === 'true') return next();
  const cost = costOf(req);
  if (cost === 0) return next();

  const { allowed, retryAfterMs } = await consumeTokens(keyOf(req), cost);
  if (allowed) return next();

  res.setHeader('Retry-After', Math.max(1, Math.ceil(retryAfterMs / 1000)));
  res.status(429).json({
    success: false,
    error: { message: 'Slow down a moment, then try again.' },
  });
};
