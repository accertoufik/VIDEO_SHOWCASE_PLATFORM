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

// Security middleware to set various HTTP headers for security best practices
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// Enable CORS for all routes. In production, you might want to restrict this to specific origins.
app.use(cors());
app.use(requestLogger);

app.use('/api', strictRateLimiter, webhookRouter);

app.use(express.json());
app.use(apiRateLimiter);

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
