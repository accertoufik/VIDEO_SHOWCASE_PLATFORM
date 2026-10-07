// Prisma returns BigInt for columns like viewCount/likeCount/sizeBytes, and
// JSON.stringify (used internally by res.json()) throws on BigInt by default.
// Teach it to serialize as a string instead of crashing every response that
// touches one of those columns.
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

import helmet from 'helmet';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import { meRouter } from './routes/me';
import { webhookRouter } from './routes/webhook';
import { requestLogger } from './middleware/requestLogger';
import { notFoundHandler } from './middleware/notFound';
import { errorHandler } from './middleware/errorHandler';
import { apiRateLimiter, strictRateLimiter } from './middleware/ratelimit';
import { invalidate } from './cache/cache.service';
import { tokenBucketLimiter } from './middleware/tokenBucket';
import { profileRouter } from './routes/profile';
import { creatorRouter } from './routes/creator';
import { videosRouter } from './routes/video';
import { playbackRouter } from './routes/playback';
import { socialRouter } from './routes/social';
import { feedRouter } from './routes/feed';
import { shortsRouter } from './routes/shorts';
import { notificationsRouter } from './routes/notification';
import { categoryRouter } from './routes/category';
import { devicesRouter } from './routes/devices';
import { libraryRouter } from './routes/library';
import { studioRouter } from './routes/studio';

export const app = express();

// Behind Azure's load balancer every request arrives from the proxy's address. Without this, the IP rate limiters
// would see ALL users as one client and block everyone together. (Trust exactly one proxy hop.)
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// Security middleware to set various HTTP headers for security best practices
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// Enable CORS for all routes. In production, you might want to restrict this to specific origins.
app.use(cors());
app.use(requestLogger);

// The strict limiter (50 / 15 min) belongs to the webhook only. Mounted on all of /api it counted EVERY
// request, which is why the app got 429s after roughly 50 calls no matter what the other limits were.
app.use('/api/webhooks', strictRateLimiter);
app.use('/api', webhookRouter);

app.use(express.json());
app.use(apiRateLimiter);
// Redis-backed token bucket (shared across replicas). No-op when REDIS_URL isn't set.
app.use('/api', tokenBucketLimiter);

// Explicit cache invalidation: after a successful change, drop the cached public data it could affect.
// (TTLs still bound staleness if Redis is unreachable at that moment.)
app.use('/api', (req, res, next) => {
  if (req.method === 'GET') return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const p = req.path;
    if (/^\/(profile|creator-profile)/.test(p) || (req.method === 'DELETE' && p === '/me')) void invalidate('creator:profile:*');
    if (/^\/videos/.test(p) && (req.method !== 'POST' || /\/(publish|complete)$/.test(p))) void invalidate('related:*', 'trending:*');
  });
  next();
});

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ message: 'Hello World! from server side' });
  // res.send("Hello World! from server side");
});

// Register routers for different API endpoints
app.use('/api', meRouter);
app.use('/api', profileRouter);
app.use('/api', creatorRouter);
app.use('/api', videosRouter);
app.use('/api', playbackRouter);
app.use('/api', socialRouter);
app.use('/api', feedRouter);
app.use('/api', shortsRouter);
app.use('/api', notificationsRouter);
app.use('/api', categoryRouter);
app.use('/api', devicesRouter);
app.use('/api', libraryRouter);
app.use('/api', studioRouter);

// Error handling middleware should be the last middleware added to the app
app.use(notFoundHandler);
app.use(errorHandler);
