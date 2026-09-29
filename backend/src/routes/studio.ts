import { Router } from 'express';
import { z } from 'zod';
import { sendSuccessResponse} from '../lib/apiResponse';
import { asyncHandler } from '../lib/asyncHandler';
import { authenticateUser, type AuthenticatedRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { StudioService } from '../services/studio.service';

export const studioRouter = Router();

const requireParam = (value: string | string[] | undefined, name: string): string => {
  if (typeof value !== 'string' || !value) throw new ApiError(400, `Invalid ${name}`);
  return value;
};

const authId = (req: AuthenticatedRequest) => {
  const id = req.auth?.userId;
  if (!id) throw new ApiError(401, 'Not authenticated');
  return id;
};

const daysQuery = z.object({
  days: z.coerce.number().int().min(1).max(365).default(28),
});

/** GET /api/studio/overview?days=28 */
studioRouter.get(
  '/studio/overview',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = daysQuery.safeParse(req.query);
    if (!parsed.success)
      throw new ApiError(
        400,
        'Invalid query',
        z.treeifyError(parsed.error),
      );
    sendSuccessResponse(
      res,
      await StudioService.overview(authId(req), parsed.data.days),
    );
  }),
);

/** GET /api/studio/videos/:videoId/analytics?days=28 */
studioRouter.get(
  '/studio/videos/:videoId/analytics',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = daysQuery.safeParse(req.query);
    if (!parsed.success)
      throw new ApiError(
        400,
        'Invalid query',
        z.treeifyError(parsed.error),
      );
    sendSuccessResponse(
      res,
      await StudioService.videoAnalytics(
        authId(req),
        requireParam(req.params.videoId, 'video ID'),
        parsed.data.days,
      ),
    );
  }),
);

const commentsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().uuid().optional(),
  videoId: z.string().uuid().optional(),
});

/** GET /api/studio/comments?videoId=&cursor=&limit= */
studioRouter.get(
  '/studio/comments',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const parsed = commentsQuery.safeParse(req.query);
    if (!parsed.success)
      throw new ApiError(
        400,
        'Invalid query',
        parsed.error.flatten().fieldErrors,
      );
    const { limit, cursor, videoId } = parsed.data;
    sendSuccessResponse(
      res,
      await StudioService.listComments(authId(req), limit, cursor, videoId),
    );
  }),
);

/** DELETE /api/studio/comments/:commentId */
studioRouter.delete(
  '/studio/comments/:commentId',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    sendSuccessResponse(
      res,
      await StudioService.removeComment(authId(req), requireParam(req.params.commentId, 'comment ID')),
    );
  }),
);
