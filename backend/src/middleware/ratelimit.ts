import { rateLimit } from 'express-rate-limit';
import type { Request } from 'express';

// Local development: set RATE_LIMIT_DISABLED=true in .env so reloads and testing never lock you out.
// Leave it unset in production.
const limitingDisabled = () => process.env.RATE_LIMIT_DISABLED === 'true';

// Log (at most once every 30s per limiter) who is being blocked and on what, so a flood can be traced.
const logBlocked = (name: string) => {
  let last = 0;
  return (req: Request) => {
    if (Date.now() - last < 30_000) return;
    last = Date.now();
    console.warn(`[rate-limit:${name}] blocking ${req.ip} ${req.method} ${req.originalUrl}`);
  };
};


//rate limit middleware to limit the number of requests from a single IP address
//this is to prevent abuse and protect the server from being overwhelmed by too many requests
// HLS playlists/segments are one request per few seconds of video, so a single viewing session would eat the
// whole general budget. They have their own, much higher limiter (streamRateLimiter) instead.
const isStreamRequest = (path: string) => /\/videos\/[^/]+\/stream\//.test(path);

const blockedApi = logBlocked('api');
const blockedStrict = logBlocked('strict');
const blockedStream = logBlocked('stream');

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 3000, // per IP per window. A phone app makes many small calls (feed, categories, me, progress...) and a household shares one IP
  skip: (req) => limitingDisabled() || isStreamRequest(req.path),
  handler: (req, res, _next, options) => {
    blockedApi(req);
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    error: {
      message:
        'Too many requests from this IP, please try again after 15 minutes',
    },
  },
});

//tighter limiter for auth-adjustment routes to prevent brute force attacks
export const strictRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 50, // limit each IP to 50 requests per windowMs
  skip: () => limitingDisabled(),
  handler: (req, res, _next, options) => {
    blockedStrict(req);
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    error: {
      message: 'Too many requests from this IP, please try again later',
    },
  },
});


//video playback (playlists + segments). Generous: ~1 request per few seconds per playing video, plus seeking.
export const streamRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 6000,
  skip: () => limitingDisabled(),
  handler: (req, res, _next, options) => {
    blockedStream(req);
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many playback requests from this IP, please try again shortly' },
  },
});
