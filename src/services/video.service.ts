import { randomUUID } from 'node:crypto';
import { prisma } from '../config/db';
import { ApiError } from '../middleware/errorHandler';
import { AzureStorageService } from './azure-storage.service';
import { JobService } from './job.service';

const requireCreatorProfile = async (clerkUserId: string) => {
  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    include: { creatorProfile: true },
  });

  if (!user) throw new ApiError(404, 'User not found');
  if (!user.creatorProfile)
    throw new ApiError(403, 'Only creators can upload videos');

  return { user, creatorProfile: user.creatorProfile };
};

interface InitUploadInput {
  title: string;
  description?: string;
  type: 'LONG_FORM' | 'SHORT_FORM';
  visibility?: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
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
          type: 'ORIGINAL_VIDEO',
          storageProvider: 'AZURE_BLOB',
          container: 'originals',
          blobPath,
          status: 'PENDING',
        },
      });

      const video = await prisma.video.create({
        data: {
          creatorId: creatorProfile.id,
          type: input.type,
          title: input.title,
          description: input.description,
          visibility: input.visibility ?? 'PUBLIC',
          status: 'UPLOADING',
          categoryId: input.categoryId,
          originalAssetId: asset.id,
        },
      });

      const uploadUrl = await AzureStorageService.generateUploadSasUrl(
        'originals',
        blobPath,
      );

      return {
        videoId: video.id,
        assetId: asset.id,
        uploadUrl,
        blobPath,
        container: 'originals' as const,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to initialize video upload', error);
    }
  },

  completeUpload: async (clerkUserId: string, videoId: string) => {
    try {
      const { creatorProfile } = await requireCreatorProfile(clerkUserId);

      const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: { originalAsset: true },
      });
      if (!video) throw new ApiError(404, 'Video not found');
      if (video.creatorId !== creatorProfile.id)
        throw new ApiError(403, 'Not your video');
      if (!video.originalAsset)
        throw new ApiError(400, 'Video has no associated upload');

      const exists = await AzureStorageService.blobExists(
        'originals',
        video.originalAsset.blobPath,
      );
      if (!exists)
        throw new ApiError(
          400,
          'Uploaded file not found in storage — upload may have failed',
        );

      await prisma.mediaAsset.update({
        where: { id: video.originalAsset.id },
        data: { status: 'UPLOADED' },
      });

      const updated = await prisma.video.update({
        where: { id: videoId },
        data: { status: 'PROCESSING' },
      });

      // Hand off to the worker (Phase 7) — it'll flip status to READY/FAILED.
      await JobService.enqueueProcessingJobs(videoId);

      return updated;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to complete video upload', error);
    }
  },

  getById: async (videoId: string, clerkUserId?: string) => {
    try {
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: {
          creator: { include: { user: true } },
          originalAsset: true,
          thumbnailAsset: true,
        },
      });

      if (!video || video.deletedAt) throw new ApiError(404, 'Video not found');

      const isOwner =
        clerkUserId != null && video.creator.user.clerkUserId === clerkUserId;
      if (!isOwner && video.visibility !== 'PUBLIC') {
        throw new ApiError(404, 'Video not found');
      }

      return video;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to load video', error);
    }
  },

  listMine: async (clerkUserId: string) => {
    try {
      const { creatorProfile } = await requireCreatorProfile(clerkUserId);

      return await prisma.video.findMany({
        where: { creatorId: creatorProfile.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to list videos', error);
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
      const { creatorProfile } = await requireCreatorProfile(clerkUserId);
      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (!video || video.creatorId !== creatorProfile.id) {
        throw new ApiError(404, 'Video not found');
      }

      return await prisma.video.update({
        where: { id: videoId },
        data: updates,
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to update video metadata', error);
    }
  },

  /**
   * Signed, time-limited download link. Reuses the same visibility check as
   * getById — a PRIVATE video still can't be downloaded by a stranger just
   * because they have a direct link. Points at the original upload (a
   * single real file) rather than the HLS output (segmented, not meant to
   * be downloaded as one playable file).
   */

  generateDownloadUrl: async (videoId: string, clerkUserId?: string) => {
    try {
      const video = await VideoService.getById(videoId, clerkUserId);
      if (!video.originalAsset || video.originalAsset.status !== 'UPLOADED') {
        throw new ApiError(404, 'No downloadable file for this video');
      }

      try {
        const downloadUrl = await AzureStorageService.generateReadSasUrl(
          'originals',
          video.originalAsset.blobPath,
          30, // minutes until the signed URL expires
        );
        return {
          downloadUrl,
          filename: `${video.title.replace(/[^a-z0-9]/gi, '_')}.mp4`,
        };
      } catch (error) {
        throw new ApiError(404, 'Failed to generate download URL', error);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to generate download URL', error);
    }
  },
  /**
   * Custom thumbnail upload — same two-step SAS-URL pattern as avatar/banner:
   * 1. Client asks for a signed upload URL and uploads the image directly to
   *    Azure Blob.
   * 2. Client calls confirmThumbnailUpload() once the upload finishes, which
   *    verifies the blob landed and points the video at the new MediaAsset.
   * This overwrites whatever thumbnail the processing worker auto-generated
   * from the video itself — a creator-supplied thumbnail takes precedence.
   */
  generateThumbnailUploadUrl: async (
    clerkUserId: string,
    videoId: string,
    fileExtension: string,
  ) => {
    try {
      const { creatorProfile } = await requireCreatorProfile(clerkUserId);
      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (!video || video.creatorId !== creatorProfile.id) {
        throw new ApiError(404, 'Video not found');
      }

      const blobName = `thumbnails/${video.id}/${randomUUID()}.${fileExtension}`;
      const uploadUrl = await AzureStorageService.generateUploadSasUrl(
        'thumbnails',
        blobName,
      );

      return { uploadUrl, blobName, container: 'thumbnails' as const };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to generate thumbnail upload URL', error);
    }
  },

  confirmThumbnailUpload: async (
    clerkUserId: string,
    videoId: string,
    blobName: string,
  ) => {
    try {
      const { creatorProfile } = await requireCreatorProfile(clerkUserId);
      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (!video || video.creatorId !== creatorProfile.id) {
        throw new ApiError(404, 'Video not found');
      }

      const exists = await AzureStorageService.blobExists('thumbnails', blobName);
      if (!exists) {
        throw new ApiError(
          400,
          'Uploaded thumbnail not found in storage — upload may have failed',
        );
      }

      const asset = await prisma.mediaAsset.create({
        data: {
          type: 'THUMBNAIL',
          storageProvider: 'AZURE_BLOB',
          container: 'thumbnails',
          blobPath: blobName,
          status: 'READY',
        },
      });

      // Replacing an existing thumbnail (worker-generated or a prior custom
      // upload): the old MediaAsset row is orphaned, same tradeoff the
      // avatar/banner flows already make.
      const updated = await prisma.video.update({
        where: { id: videoId },
        data: { thumbnailAssetId: asset.id, thumbnailIsCustom: true },
        include: { thumbnailAsset: true },
      });

      return updated;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to confirm thumbnail upload', error);
    }
  },

  /** bumps the share counter - called once per "sahre" tap in the client */
  incrementShareCount: async (videoId: string) => {
    try {
      const existing = await prisma.video.findUnique({
        where: { id: videoId },
      });
      if (!existing || existing.deletedAt || existing.visibility !== 'PUBLIC') {
        throw new ApiError(404, 'Video not found');
      }

      const video = await prisma.video.update({
        where: { id: videoId },
        data: { shareCount: { increment: 1 } },
      });
      return { shareCount: video.shareCount };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to increment share count', error);
    }
  },
};
