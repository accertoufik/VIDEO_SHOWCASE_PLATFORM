/* ===== OLD CODE (commented out, kept for reference) =====

import { randomUUID } from 'node:crypto';
import { prisma } from '../config/db';
import { AzureStorageService } from './azure-storage.service';
import { ApiError } from '../middleware/errorHandler';
import { JobService } from './job.service';

interface InitVideoInput {
  title: string;
  description?: string;
  type: 'LONG_FORM' | 'SHORT_FORM';
  visibility?: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
  categoryId?: string;
  fileExtension: string;
  mimeType: string;
}

const getCreatorProfileOrThrow = async (clerkUserId: string) => {
  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    include: { creatorProfile: true },
  });
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  if (!user.creatorProfile) {
    throw new ApiError(
      403,
      'Only creators can upload videos. Please create a creator profile first.',
    );
  }
  return user.creatorProfile;
};

export const VideoService = {
  initUpload: async (clerkUserId: string, input: InitVideoInput) => {
    try {
      const creatorProfile = await getCreatorProfileOrThrow(clerkUserId);
      const blobName = `${creatorProfile.id}/${randomUUID()}.${input.fileExtension}`;
      const uploadUrl = await AzureStorageService.generateUploadSasUrl(
        'originals',
        blobName,
      );

      const originalAsset = await prisma.mediaAsset.create({
        data: {
          type: 'ORIGINAL_VIDEO',
          storageProvider: 'AZURE_BLOB',
          container: 'originals',
          blobPath: blobName,
          mimeType: input.mimeType,
          status: 'PENDING',
        },
      });

      const video = await prisma.video.create({
        data: {
          creatorId: creatorProfile.id,
          title: input.title,
          description: input.description,
          type: input.type,
          visibility: input.visibility ?? 'PUBLIC',
          categoryId: input.categoryId,
          originalAssetId: originalAsset.id,
          status: 'UPLOADING',
        },
      });
      return {
        videoId: video.id,
        assetId: originalAsset.id,
        uploadUrl,
        blobName,
        container: 'originals' as const,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Error initializing video upload', error);
    }
  },

  completeUpload: async (clerkUserId: string, videoId: string) => {
    try {
      const creatorProfile = await getCreatorProfileOrThrow(clerkUserId);
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: { originalAsset: true },
      });
      if (!video) {
        throw new ApiError(404, 'Video not found');
      }
      if (video.creatorId !== creatorProfile.id) {
        throw new ApiError(
          403,
          'You do not have permission to complete this upload',
        );
      }
      if (!video.originalAsset) {
        throw new ApiError(
          500,
          'Video does not have an associated original asset',
        );
      }

      const exists = await AzureStorageService.blobExists(
        'originals',
        video.originalAsset.blobPath,
      );
      if (!exists) {
        throw new ApiError(
          400,
          'Uploaded video file does not exist in storage - upload may have failed or been deleted',
        );
      }

      const properties = await AzureStorageService.getBlobProperties(
        'originals',
        video.originalAsset.blobPath,
      );
      if (!properties.contentLength || properties.contentLength <= 0) {
        throw new ApiError(400, 'Uploaded video file is empty');
      }

      await prisma.mediaAsset.update({
        where: { id: video.originalAsset.id },
        data: {
          status: 'UPLOADED',
          sizeBytes: properties.contentLength
            ? BigInt(properties.contentLength)
            : null,
        },
      });

      const updatedVideo = await prisma.video.update({
        where: { id: videoId },
        data: { status: 'UPLOADED' },
        include: { originalAsset: true },
      });

      return updatedVideo;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Error completing video upload', error);
    }
  },

  getById: async (videoId: string, viewerClerkUserId?: string) => {
    try {
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: {
          originalAsset: true,
          creator: { include: { user: true } },
          category: true,
          thumbnailAsset: true,
        },
      });

      if (!video || video.deletedAt) {
        throw new ApiError(404, 'Video not found');
      }

      const isOwner =
        viewerClerkUserId &&
        video.creator.user.clerkUserId === viewerClerkUserId;
      if (video.visibility === 'PRIVATE' && !isOwner) {
        throw new ApiError(
          404,
          'You do not have permission to view this video',
        );
      }
      return video;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Error fetching video by ID', error);
    }
  },

  updateMetadata: async (
    clerkUserId: string,
    videoId: string,
    updates: Partial<{
      title: string;
      description: string;
      visibility: 'PUBLIC' | 'PRIVATE' | 'UNLISTED';
      categoryId: string;
    }>,
  ) => {
    try {
      const creatorProfile = await getCreatorProfileOrThrow(clerkUserId);
      const video = await prisma.video.findUnique({
        where: { id: videoId },
      });
      if (!video || video.creatorId !== creatorProfile.id) {
        throw new ApiError(404, 'Video not found');
      }

      const updated = await prisma.video.update({
        where: { id: videoId },
        data: updates,
      });
      return updated;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to update video metadata', error);
    }
  },
};

===== END OLD CODE ===== */

import { randomUUID } from "node:crypto";
import { prisma } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { AzureStorageService } from "./azure-storage.service";
import { JobService } from "./job.service";

const requireCreatorProfile = async (clerkUserId: string) => {
  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    include: { creatorProfile: true },
  });

  if (!user) throw new ApiError(404, "User not found");
  if (!user.creatorProfile) throw new ApiError(403, "Only creators can upload videos");

  return { user, creatorProfile: user.creatorProfile };
};

interface InitUploadInput {
  title: string;
  description?: string;
  type: "LONG_FORM" | "SHORT_FORM";
  visibility?: "PUBLIC" | "UNLISTED" | "PRIVATE";
  categoryId?: string;
  fileExtension: string;
}

export const VideoService = {
  initUpload: async (clerkUserId: string, input: InitUploadInput) => {
    try {
      const { creatorProfile } = await requireCreatorProfile(clerkUserId);

      const blobPath = `${creatorProfile.id}/${randomUUID()}.${input.fileExtension}`;

      const asset = await prisma.mediaAsset.create({
        data: {
          type: "ORIGINAL_VIDEO",
          storageProvider: "AZURE_BLOB",
          container: "originals",
          blobPath,
          status: "PENDING",
        },
      });

      const video = await prisma.video.create({
        data: {
          creatorId: creatorProfile.id,
          type: input.type,
          title: input.title,
          description: input.description,
          visibility: input.visibility ?? "PUBLIC",
          status: "UPLOADING",
          categoryId: input.categoryId,
          originalAssetId: asset.id,
        },
      });

      const uploadUrl = await AzureStorageService.generateUploadSasUrl("originals", blobPath);

      return { videoId: video.id, assetId: asset.id, uploadUrl, blobPath, container: "originals" as const };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to initialize video upload", error);
    }
  },

  completeUpload: async (clerkUserId: string, videoId: string) => {
    try {
      const { creatorProfile } = await requireCreatorProfile(clerkUserId);

      const video = await prisma.video.findUnique({ where: { id: videoId }, include: { originalAsset: true } });
      if (!video) throw new ApiError(404, "Video not found");
      if (video.creatorId !== creatorProfile.id) throw new ApiError(403, "Not your video");
      if (!video.originalAsset) throw new ApiError(400, "Video has no associated upload");

      const exists = await AzureStorageService.blobExists("originals", video.originalAsset.blobPath);
      if (!exists) throw new ApiError(400, "Uploaded file not found in storage — upload may have failed");

      await prisma.mediaAsset.update({
        where: { id: video.originalAsset.id },
        data: { status: "UPLOADED" },
      });

      const updated = await prisma.video.update({
        where: { id: videoId },
        data: { status: "PROCESSING" },
      });

      // Hand off to the worker (Phase 7) — it'll flip status to READY/FAILED.
      await JobService.enqueueProcessingJobs(videoId);

      return updated;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to complete video upload", error);
    }
  },

  getById: async (videoId: string, clerkUserId?: string) => {
    try {
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: { creator: { include: { user: true } }, originalAsset: true, thumbnailAsset: true },
      });

      if (!video || video.deletedAt) throw new ApiError(404, "Video not found");

      const isOwner = clerkUserId != null && video.creator.user.clerkUserId === clerkUserId;
      if (!isOwner && video.visibility !== "PUBLIC") {
        throw new ApiError(404, "Video not found");
      }

      return video;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to load video", error);
    }
  },

  listMine: async (clerkUserId: string) => {
    try {
      const { creatorProfile } = await requireCreatorProfile(clerkUserId);

      return await prisma.video.findMany({
        where: { creatorId: creatorProfile.id, deletedAt: null },
        orderBy: { createdAt: "desc" },
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to list videos", error);
    }
  },

  updateMetadata: async (
    clerkUserId: string,
    videoId: string,
    updates: Partial<{
      title: string;
      description: string;
      visibility: "PUBLIC" | "PRIVATE" | "UNLISTED";
      categoryId: string;
    }>,
  ) => {
    try {
      const { creatorProfile } = await requireCreatorProfile(clerkUserId);
      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (!video || video.creatorId !== creatorProfile.id) {
        throw new ApiError(404, "Video not found");
      }

      return await prisma.video.update({
        where: { id: videoId },
        data: updates,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to update video metadata", error);
    }
  },
};
