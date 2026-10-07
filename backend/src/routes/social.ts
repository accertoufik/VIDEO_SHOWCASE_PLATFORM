import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler';
import { ApiError } from '../middleware/errorHandler';
import { SocialService } from '../services/social.service';
import {
  authenticateUser,
  optionalAuth,
  type AuthenticatedRequest,
} from '../middleware/auth';
import { sendSuccessResponse } from '../lib/apiResponse';

const pageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.uuid().optional(),
});


export const socialRouter = Router();

const requireAuthUserId = (req: AuthenticatedRequest): string => {
  const clerkUserId = req.auth?.userId;
  if (!clerkUserId) {
    throw new ApiError(401, 'Unauthorized');
  }
  return clerkUserId;
};

//follows

socialRouter.post(
  '/creators/:creatorId/follow',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = requireAuthUserId(req);
      const creatorId = req.params.creatorId;
      if (typeof creatorId !== 'string') {
        throw new ApiError(400, 'Invalid creator ID');
      }
    const result = await SocialService.followCreator(clerkUserId, creatorId);
    sendSuccessResponse(res, result, 201);
  }),
);

//unfollow
socialRouter.delete(
  '/creators/:creatorId/follow',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = requireAuthUserId(req);
      const creatorId = req.params.creatorId;
      if (typeof creatorId !== 'string') {
        throw new ApiError(400, 'Invalid creator ID');
      }
    const result = await SocialService.unfollowCreator(clerkUserId, creatorId);
    sendSuccessResponse(res, result, 200);
  }),
);

// video likes

socialRouter.post(
  '/videos/:videoId/like',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = requireAuthUserId(req);
    const videoId = req.params.videoId;
    if (typeof videoId !== 'string') {
      throw new ApiError(400, 'Invalid video ID');
    }
    const result = await SocialService.likeVideo(clerkUserId, videoId);
    sendSuccessResponse(res, result, 201);
  }),
);

//video disliked
socialRouter.delete(
  '/videos/:videoId/like',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = requireAuthUserId(req);
    const videoId = req.params.videoId;
    if (typeof videoId !== 'string') {
      throw new ApiError(400, 'Invalid video ID');
    }
    const result = await SocialService.unlikeVideo(clerkUserId, videoId);
    sendSuccessResponse(res, result, 200);
  }),
);

//post a comment
const commentSchema = z.object({
  body: z.string().min(1).max(2000),
  parentCommentId: z.uuid().optional(),
});

//delete a comment
socialRouter.post(
  '/videos/:videoId/comments',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = requireAuthUserId(req);
    const videoId = req.params.videoId;
    if (typeof videoId !== 'string') {
      throw new ApiError(400, 'Invalid video ID');
    }
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        'Invalid comment data',
        z.treeifyError(parsed.error),
      );
    }
    const result = await SocialService.addComment(
      clerkUserId,
      videoId,
      parsed.data.body,
      parsed.data.parentCommentId ?? null,
    );
    sendSuccessResponse(res, { comment: result }, 201);
  }),
);

//list comments for a video
socialRouter.get(
  '/videos/:videoId/comments',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const videoId = req.params.videoId;
    if (typeof videoId !== 'string') {
      throw new ApiError(400, 'Invalid video ID');
    }
    const comments = await SocialService.listComments(videoId, req.auth?.userId);
    sendSuccessResponse(res, { comments }, 200);
  }),
);

//delete comment
socialRouter.delete(
  '/comments/:commentId',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = requireAuthUserId(req);
    const commentId = req.params.commentId;
    if (typeof commentId !== 'string') {
      throw new ApiError(400, 'Invalid comment ID');
    }
    await SocialService.deleteComment(clerkUserId, commentId);
    sendSuccessResponse(res, { deleted: true }, 200);
  }),
);

// --saved videos --
socialRouter.post(
  '/videos/:videoId/save',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = requireAuthUserId(req);
    const videoId = req.params.videoId;
    if (typeof videoId !== 'string') {
      throw new ApiError(400, 'Invalid video ID');
    }
    const result = await SocialService.saveToWatchlist(clerkUserId, videoId);
    sendSuccessResponse(res, result, 201);
  }),
);

// --unsave videos --
socialRouter.delete(
  '/videos/:videoId/save',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = requireAuthUserId(req);
    const videoId = req.params.videoId;
    if (typeof videoId !== 'string') {
      throw new ApiError(400, 'Invalid video ID');
    }
    const result = await SocialService.removeFromWatchlist(
      clerkUserId,
      videoId,
    );
    sendSuccessResponse(res, result, 200);
  }),
);

//--get saved videos for a user
socialRouter.get(
  '/videos/saved/mine',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = requireAuthUserId(req);
    const page = pageQuery.safeParse(req.query);
    if (!page.success) {
      throw new ApiError(400, 'Invalid query parameters', z.treeifyError(page.error));
    }
    const { limit, cursor } = page.data;
    sendSuccessResponse(res, await SocialService.getWatchlist(clerkUserId, limit, cursor), 200);
  }),
);

//--get liked videos for a user
socialRouter.get(
  '/videos/liked/mine',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = requireAuthUserId(req);
    const page = pageQuery.safeParse(req.query);
    if (!page.success) {
      throw new ApiError(400, 'Invalid query parameters', z.treeifyError(page.error));
    }
    const { limit, cursor } = page.data;
    sendSuccessResponse(res, await SocialService.listLikedVideos(clerkUserId, limit, cursor), 200);
  }),
);
