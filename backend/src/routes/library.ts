import { Router } from 'express';
import { z } from 'zod';
import { sendSuccessResponse } from '../lib/apiResponse';
import { asyncHandler } from '../lib/asyncHandler';
import { authenticateUser, type AuthenticatedRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { LibraryService } from '../services/library.service';

export const libraryRouter = Router();

const requireParam = (value: string | string[] | undefined, name: string): string => {
  if (typeof value !== 'string' || !value) throw new ApiError(400, `Invalid ${name}`);
  return value;
};

const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
});

const authId = (req: AuthenticatedRequest) => {
  const id = req.auth?.userId;
  if (!id) throw new ApiError(401, 'Not authenticated');
  return id;
};

const parsePage = (query: unknown) => {
  const parsed = pageQuery.safeParse(query);
  if (!parsed.success)
    throw new ApiError(
      400,
      'Invalid query',
      parsed.error.flatten().fieldErrors,
    );
  return parsed.data;
};

/** GET /api/me/history?limit=&cursor= — one entry per video, newest first, with resume progress. */
libraryRouter.get(
  '/me/history',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { limit, cursor } = parsePage(req.query);
    sendSuccessResponse(
      res,
      await LibraryService.listHistory(authId(req), limit, cursor),
    );
  }),
);

/** DELETE /api/me/history — clear everything (history + resume points). */
libraryRouter.delete(
  '/me/history',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccessResponse(res, await LibraryService.clearHistory(authId(req)));
  }),
);

/** DELETE /api/me/history/:videoId — remove one video from history + Continue Watching. */
libraryRouter.delete(
  '/me/history/:videoId',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccessResponse(
      res,
      await LibraryService.removeFromHistory(authId(req), requireParam(req.params.videoId, 'video ID')),
    );
  }),
);

/** GET /api/me/continue-watching — started-but-unfinished videos with positionMs. */
libraryRouter.get(
  '/me/continue-watching',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { limit, cursor } = parsePage(req.query);
    sendSuccessResponse(
      res,
      await LibraryService.listContinueWatching(authId(req), limit, cursor),
    );
  }),
);

/** GET /api/me/following — creators the caller follows. */
libraryRouter.get(
  '/me/following',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { limit, cursor } = parsePage(req.query);
    sendSuccessResponse(
      res,
      await LibraryService.listFollowing(authId(req), limit, cursor),
    );
  }),
);
