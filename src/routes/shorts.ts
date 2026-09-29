import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { ApiError } from '../middleware/errorHandler';
import { sendSuccessResponse } from '../lib/apiResponse';
import { FeedService } from '../services/feed.service';

export const shortsRouter = Router();

const shortsQuerySchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .refine((val) => val === undefined || (Number.isInteger(val) && val > 0), {
      message: 'limit must be a positive integer',
    }),
  cursor: z.string().optional(),
  categoryId: z.uuid().optional(),
});

/**
 * GET /api/shorts
 * The Shorts section: PUBLIC, published, SHORT_FORM videos only, newest
 * first, cursor-paginated exactly like GET /api/feed (pass nextCursor back
 * as ?cursor=). Public — no auth required, same as the home feed.
 */

shortsRouter.get(
  '/shorts',
  asyncHandler(async (req, res) => {
    const parsed = shortsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'Invalid shorts query',
        z.treeifyError(parsed.error),
      );
    }
    const limit = parsed.data.limit ?? 20;
    const cursor = parsed.data.cursor;
    const categoryId = parsed.data.categoryId;
    const result = await FeedService.getShortsFeed(cursor, limit, categoryId);
    sendSuccessResponse(res, result, 200);
  }),
);
