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
import { videosRouter } from './routes/video';

export const app = express();


app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

app.use(cors());
app.use(requestLogger);

app.use('/api', strictRateLimiter, webhookRouter);

app.use(express.json());
app.use(apiRateLimiter);

app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ message: 'Hello World! from server side' });
  // res.send("Hello World! from server side");
});

app.use('/api', meRouter);
app.use('/api', profileRouter);
app.use('/api', videosRouter);


app.use(notFoundHandler);
app.use(errorHandler);
