import { randomUUID } from 'node:crypto';
import { prisma } from '../config/db';
import { ApiError } from '../middleware/errorHandler';
import { AzureStorageService } from './azure-storage.service';
import { JobService } from './job.service';
import { NotificationService } from './notification.service';

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
  // Optional and NOT trusted: the worker overwrites it from the real file
  // after ffprobe (see classifyVideoFormat). Still accepted so existing
  // frontends/Postman requests that send it don't break.
  type?: 'LONG_FORM' | 'SHORT_FORM';
  visibility?: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  categoryId: string;
  fileExtension: string;
  // The YouTube-style upload-time choice: "AUTO" (default — we'll grab a
  // frame from the video) or "CUSTOM" (creator intends to upload their
  // own). Purely a stated intent for the frontend to act on — see the
  // thumbnailSource comment on the Video model for what it does and
  // doesn't change about backend behavior.
  thumbnailSource?: 'AUTO' | 'CUSTOM';
}

export const VideoService = {
  initUpload: async (clerkUserId: string, input: InitUploadInput) => {
    try {
      const { creatorProfile } = await requireCreatorProfile(clerkUserId);

      const category = await prisma.category.findUnique({
        where: { id: input.categoryId },
      });
      if (!category) {
        throw new ApiError(
          400,
          'Invalid categoryId — see GET /api/categories for valid options',
        );
      }

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
          // Provisional placeholder only — the worker sets the real value
          // from the actual file (duration + aspect ratio) before READY.
          type: input.type ?? 'LONG_FORM',
          title: input.title,
          description: input.description,
          // Nothing is actually public until the creator explicitly calls
          // publish() below — this stays PRIVATE no matter what the
          // request asked for, all the way through UPLOADING/PROCESSING
          // and even through READY (480p/720p watchable). What they asked
          // for is only remembered on requestedVisibility, to pre-fill
          // the publish dialog once it's their call to make.
          visibility: 'PRIVATE',
          requestedVisibility: input.visibility ?? 'PUBLIC',
          thumbnailSource: input.thumbnailSource ?? 'AUTO',
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
          hlsManifestAsset: true,
          variants: true,
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
    // visibility is deliberately excluded — it only changes via publish().
    updates: Partial<{
      title: string;
      description: string;
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
   * The explicit "go live" action — separate from upload/processing on
   * purpose. A video sits PRIVATE from the moment it's created through
   * READY (480p/720p watchable); it only actually becomes visible to
   * anyone else once the owning creator calls this.
   *
   * DESIGN DECISION (matches real YouTube behavior): PUBLIC is allowed as
   * soon as the video is READY (480p/720p done) — it does NOT wait for
   * hdReady. Publishing early just means early viewers get a 480p/720p
   * ceiling; once the HD job finishes later, MediaProcessingService
   * .transcodeHdRung() has already amended the live master.m3u8 in place,
   * so the higher rung(s) are simply there for any player that (re)reads
   * the manifest afterward — no second publish call needed. The creator
   * gets ONE "HD is ready" notification when the first/minimum HD rung
   * (1080p) finishes (see the worker's processTranscode1080pJob) — if the
   * source also qualifies for 1440p, that's added later completely
   * silently, with no second notification (see processTranscode1440pJob).
   */
  publish: async (
    clerkUserId: string,
    videoId: string,
    visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE',
  ) => {
    try {
      const { creatorProfile } = await requireCreatorProfile(clerkUserId);

      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (!video || video.deletedAt) throw new ApiError(404, 'Video not found');
      if (video.creatorId !== creatorProfile.id)
        throw new ApiError(403, 'Not your video');

      if (video.status !== 'READY' && video.status !== 'PUBLISHED') {
        throw new ApiError(
          400,
          `Video isn't watchable yet (status: ${video.status}) — wait for processing to finish`,
        );
      }

      const updated = await prisma.video.update({
        where: { id: videoId },
        data: { visibility, status: 'PUBLISHED', publishedAt: new Date() },
      });

      if (visibility === 'PUBLIC') {
        await NotificationService.notifyFollowersOfNewVideo(
          updated.creatorId,
          updated.id,
          updated.title,
        );
      }

      return updated;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to publish video', error);
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

      const exists = await AzureStorageService.blobExists(
        'thumbnails',
        blobName,
      );
      if (!exists) {
        throw new ApiError(
          400,
          'Uploaded thumbnail not found in storage — upload may have failed',
        );
      }

      let asset;
      try {
        asset = await prisma.mediaAsset.create({
          data: {
            type: 'THUMBNAIL',
            storageProvider: 'AZURE_BLOB',
            container: 'thumbnails',
            blobPath: blobName,
            status: 'READY',
          },
        });
      } catch (error: any) {
        if (error.code === 'P2002') {
          throw new ApiError(
            409,
            'This thumbnail upload has already been confirmed',
          );
        }
        throw error;
      }

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

  /**
   * Owner-only SOFT delete. Every read path already filters deletedAt, so this
   * removes the video from feed, shorts, search, trending, related, channel
   * pages, saved/liked/history and playback. Queued encode jobs are cancelled;
   * a job already RUNNING is ignored by the worker's deleted-video guard.
   * Azure blobs are NOT purged (kept recoverable; a cleanup job can reclaim later).
   */

  deleteVideo: async(clerkUserId: string, videoId: string) => {
    try {
      const { creatorProfile } = await requireCreatorProfile(clerkUserId);
      const video = await prisma.video.findUnique({ where: { id: videoId } });
      if (!video || video.creatorId !== creatorProfile.id) {
        throw new ApiError(404, 'Video not found');
      }

      await prisma.$transaction([
        prisma.video.update({
          where: { id: videoId },
          data: { deletedAt: new Date(), status: 'DELETED', visibility: 'PRIVATE' },
        }),
        prisma.mediaProcessingJob.updateMany({
          where: { videoId, status: { in: ['QUEUED', 'RETRYING'] } },
          data: { status: 'FAILED', completedAt: new Date(), errorMessage: 'Video deleted by owner' },
        }),
      ]);

      return {deleted: true, videoId};
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to delete video', error);
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
