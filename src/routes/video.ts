import { verifyToken } from '@clerk/backend';
import { Router } from 'express';
import { z } from 'zod';
import { sendSuccessResponse } from '../lib/apiResponse';
import { asyncHandler } from '../lib/asyncHandler';
import {
  type AuthenticatedRequest,
  authenticateUser,
  optionalAuth,
} from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { VideoService } from '../services/video.service';
import { env } from '../config/env';

export const videosRouter = Router();

const parseVideoId = (rawVideoId: unknown): string => {
  const parsed = z.uuid().safeParse(rawVideoId);
  if (!parsed.success) {
    throw new ApiError(404, 'Video not found');
  }
  return parsed.data;
};

const initVideoSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  type: z.enum(['LONG_FORM', 'SHORT_FORM']),
  visibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']).optional(),
  categoryId: z.uuid({
    message: 'Category is required - see GET/api/categories',
  }),
  fileExtension: z.string().min(1).max(10),
  mimeType: z.string().min(1),
});

/** POST  /api/videos/init
 * creator-only endpoint to initialize a video upload. It creates a pending media asset and a draft video row, and returns a short-lived SAS URL for the client to upload the raw file directly to Azure Blob Storage.
 */

videosRouter.post(
  '/videos/init',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = req.auth?.userId;
    if (!clerkUserId) {
      throw new ApiError(401, 'Unauthorized: No user ID found in request');
    }

    const parsedBody = initVideoSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw new ApiError(
        400,
        'Invalid request body',
        z.treeifyError(parsedBody.error).properties,
      );
    }

    const result = await VideoService.initUpload(clerkUserId, parsedBody.data);
    sendSuccessResponse(res, result);
  }),
);

/** POST /api/videos/:videoId/complete
 * verifies the raw video file has been uploaded to Azure Blob Storage, and then triggers the video processing pipeline (transcoding, thumbnail generation, etc.). This endpoint is called by the client after the raw video upload is complete.
 */

videosRouter.post(
  '/videos/:videoId/complete',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = req.auth?.userId;
    if (!clerkUserId) {
      throw new ApiError(401, 'Unauthorized: No user ID found in request');
    }

    const videoId = parseVideoId(req.params.videoId);

    const result = await VideoService.completeUpload(clerkUserId, videoId);
    sendSuccessResponse(res, result);
  }),
);

/** GET /api/videos/mine
 * Lists all videos belonging to the authenticated creator. Must be registered
 * before /videos/:videoId, otherwise Express matches "mine" as a :videoId
 * and it never reaches this handler.
 */

videosRouter.get(
  '/videos/mine',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = req.auth?.userId;
    if (!clerkUserId) {
      throw new ApiError(401, 'Unauthorized: No user ID found in request');
    }

    const videos = await VideoService.listMine(clerkUserId);
    sendSuccessResponse(res, { videos });
  }),
);

/** GET /api/videos/:videoId
 * Public unless private, in which case only the owning creator can access it. Returns the video metadata and the processed media assets (transcoded videos, thumbnails, etc.) if available.
 */

videosRouter.get(
  '/videos/:videoId',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    //No require authentication for public videos, but if the video is private, we will check if the user is authenticated and is the owner of the video.
    const authHeader = req.headers.authorization;
    let viewerClerkUserId: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length);
      try {
        const verifiedToken = await verifyToken(token, {
          secretKey: env.CLERK_SECRET_KEY,
        });
        viewerClerkUserId = verifiedToken.sub;
      } catch (error) {
        console.error('Error verifying token:', error);
        // We won't throw an error here, because we want to allow public access to public videos.
      }
    }
    const videoId = parseVideoId(req.params.videoId);
    const video = await VideoService.getById(videoId, viewerClerkUserId);
    sendSuccessResponse(res, { video });
  }),
);

const updateVideoSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  visibility: z.enum(['PUBLIC', 'UNLISTED', 'PRIVATE']).optional(),
  categoryId: z.uuid().optional(),
});

/** PATCH /api/videos/:videoId
 * Updates the metadata of a video. Only the creator of the video can update it.
 */

videosRouter.patch(
  '/videos/:videoId',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = req.auth?.userId;
    if (!clerkUserId) {
      throw new ApiError(401, 'Unauthorized: No user ID found in request');
    }

    const videoId = parseVideoId(req.params.videoId);
    const parsedBody = updateVideoSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw new ApiError(
        400,
        'Invalid video request',
        z.treeifyError(parsedBody.error).properties,
      );
    }

    const updatedVideo = await VideoService.updateMetadata(
      clerkUserId,
      videoId,
      parsedBody.data,
    );
    sendSuccessResponse(res, { video: updatedVideo });
  }),
);

/**
 * GET /api/videos/:videoId/download
 * Returns a short-lived signed URL to the original uploaded file.
 * Same visibility rules as viewing the video apply.
 */

videosRouter.get(
  '/videos/:videoId/download',
  optionalAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const videoId = parseVideoId(req.params.videoId);
    const result = await VideoService.generateDownloadUrl(
      videoId,
      req.auth?.userId,
    );
    sendSuccessResponse(res, { downloadUrl: result });
  }),
);

const thumbnailUploadSchema = z.object({
  fileExtension: z.string().regex(/^\.\w+$/, 'Invalid file extension'),
});

/** POST /api/videos/:videoId/thumbnail
 * Creator-only. Requests a signed upload URL for a custom thumbnail image.
 */

videosRouter.post(
  '/videos/:videoId/thumbnail',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = req.auth?.userId;
    if (!clerkUserId) {
      throw new ApiError(401, 'Unauthorized: No user ID found in request');
    }

    const videoId = parseVideoId(req.params.videoId);
    const parsedBody = thumbnailUploadSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw new ApiError(
        400,
        'Invalid thumbnail upload request',
        z.treeifyError(parsedBody.error).properties,
      );
    }

    const result = await VideoService.generateThumbnailUploadUrl(
      clerkUserId,
      videoId,
      parsedBody.data.fileExtension,
    );
    sendSuccessResponse(res, result);
  }),
);

const confirmThumbnailSchema = z.object({
  blobName: z.string().min(1),
});

/** POST /api/videos/:videoId/thumbnail/confirm
 * Creator-only. Confirms the custom thumbnail upload finished and points
 * the video at it, overwriting the worker-generated one if present.
 */

videosRouter.post(
  '/videos/:videoId/thumbnail/confirm',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = req.auth?.userId;
    if (!clerkUserId) {
      throw new ApiError(401, 'Unauthorized: No user ID found in request');
    }

    const videoId = parseVideoId(req.params.videoId);
    const parsedBody = confirmThumbnailSchema.safeParse(req.body);
    if (!parsedBody.success) {
      throw new ApiError(
        400,
        'Invalid thumbnail confirmation request',
        z.treeifyError(parsedBody.error).properties,
      );
    }

    const result = await VideoService.confirmThumbnailUpload(
      clerkUserId,
      videoId,
      parsedBody.data.blobName,
    );
    sendSuccessResponse(res, { video: result });
  }),
);

/**
 * POST /api/videos/:videoId/share
 * Bumps the share counter. No auth required — sharing a public video is a
 * low-stakes action, and requiring login here would just add friction.
 */

videosRouter.post(
  '/videos/:videoId/share',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const videoId = parseVideoId(req.params.videoId);
    await VideoService.incrementShareCount(videoId);
    sendSuccessResponse(res, { message: 'Share count bumped' });
  }),
);
