import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { ApiError } from '../middleware/errorHandler';
import {
    optionalAuth,
  authenticateUser,
  type AuthenticatedRequest,
} from '../middleware/auth';
import { sendSuccessResponse } from '../lib/apiResponse';
import { FeedService } from '../services/feed.service';

export const feedRouter = Router();

const feedQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .refine((val) => val === undefined || (Number.isInteger(val) && val > 0), {
      message: 'limit must be a positive integer',
    }),
  cursor: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  scope: z.enum(["videos", "creators", "categories", "all"]).default("videos"),
  type: z.enum(["LONG_FORM", "SHORT_FORM"]).optional(),
});


/**
 * GET /api/feed
 * ?categoryId=<uuid> (optional) — when present, only videos in that
 * category are returned. This is what the category buttons on the home
 * feed call: same endpoint, same cursor pagination, just filtered.
 */

feedRouter.get(
  '/feed',
  asyncHandler(async (req, res) => {
    const parsed = feedQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'Invalid query parameters',
        z.treeifyError(parsed.error),
      );
    }
    const limit = parsed.data.limit ?? 20;
    const cursor = parsed.data.cursor;
    const categoryId = parsed.data.categoryId;
    const result = await FeedService.getHomeFeed(cursor, limit, categoryId);
    sendSuccessResponse(res, result, 200);
  }),
);

/** GET /api/search?q=title+text&limit=20 */
feedRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const parsed = feedQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'Invalid search query',
        z.treeifyError(parsed.error),
      );
    }
    const { q, cursor, scope, type } = parsed.data;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;

    // if (typeof query !== 'string' || query.trim() === '') {
    //   throw new ApiError(400, 'Query parameter "q" is required and must be a non-empty string');
    // }
    // if (isNaN(limit) || limit <= 0) {
    //   throw new ApiError(400, 'Query parameter "limit" must be a positive integer');
    // }

    // const videos = await FeedService.searchVideos(query, limit);
    sendSuccessResponse(res, await FeedService.search(q, limit, { cursor, scope, type }), 200);
  }),
);

const creatorVideosQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
  type: z.enum(['LONG_FORM', 'SHORT_FORM']).optional(),
});

feedRouter.get(
  '/creators/:creatorId/videos',
  asyncHandler(async (req, res) => {
    const parsed = creatorVideosQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'Invalid query parameters',
        z.treeifyError(parsed.error),
      );
    }
    const { limit, cursor, type } = parsed.data;
    const creatorId = z.uuid().safeParse(req.params.creatorId);
    if (!creatorId.success) throw new ApiError(400, 'Invalid creator ID');
    const result = await FeedService.getCreatorVideos(creatorId.data, limit, cursor, type);
    sendSuccessResponse(res, result, 200);
  }),
);

/**
 * GET /api/trending
 * ?type=SHORT_FORM|LONG_FORM (required — the two are never mixed together)
 * ?categoryId=<uuid>         (optional — "Trending in <category>"; omit for platform-wide)
 * ?windowDays=7              (optional — only videos published within this many days are ranked)
 * ?limit=20
 */
const trendingQuerySchema = z.object({
  type: z.enum(['LONG_FORM', 'SHORT_FORM']),
  categoryId: z.uuid().optional(),
  windowDays: z.coerce.number().int().min(1).max(90).default(7),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});


feedRouter.get(
  '/trending',
  asyncHandler(async (req, res) => {
    const parsed = trendingQuerySchema.safeParse(req.query);
    if (!parsed.success)
      throw new ApiError(
        400,
        'Invalid trending query',
        z.treeifyError(parsed.error),
      );

    const result = await FeedService.getTrending(parsed.data);
    sendSuccessResponse(res, result);
  }),
);