import { prisma } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { randomUUID } from "node:crypto";
import { AzureStorageService } from "./azure-storage.service";

const requireOwnCreatorProfile = async (clerkUserId: string) => {
  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    include: { creatorProfile: true },
  });

  if (!user) throw new ApiError(404, 'User not found');
  if (!user.creatorProfile)
    throw new ApiError(403, 'Only creators have a creator profile');

  return { user, creatorProfile: user.creatorProfile };
};

export const CreatorService = {
  becomeCreator: async (clerkUserId: string, channelName: string) => {
    try {
      const user = await prisma.user.findUnique({
        where: { clerkUserId },
        include: { creatorProfile: true },
      });
      if (!user) {
        throw new ApiError(404, 'User not found');
      }
      if (user.creatorProfile) {
        throw new ApiError(409, 'User is already a creator');
      }

      const existingChannel = await prisma.creatorProfile.findUnique({
        where: { channelName },
      });
      if (existingChannel) {
        throw new ApiError(409, 'Channel name is already taken');
      }

      const [, creatorProfile] = await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { role: 'CREATOR' },
        }),
        prisma.creatorProfile.create({
          data: { userId: user.id, channelName },
        }),
      ]);

      return creatorProfile;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to create creator profile', error);
    }
  },

  /** Text-only edit — the "About" section on a channel page. Banner image goes through the two methods below. */
  updateAboutText: async (clerkUserId: string, aboutText: string) => {
    try {
      const { creatorProfile } = await requireOwnCreatorProfile(clerkUserId);

      const updated = await prisma.creatorProfile.update({
        where: { id: creatorProfile.id },
        data: { aboutText },
      });

      return updated;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to update about text', error);
    }
  },
  /**
   * Same two-step pattern as the profile avatar upload :
   * 1. Client asks us for a signed upload URL and uploads the banner image
   *    directly to Azure Blob (the file never passes through our server).
   * 2. Client calls confirmBannerUpload() once the upload finishes, which
   *    verifies the blob actually landed and creates the MediaAsset row.
   * Reuses the "thumbnails" container — same as avatars, since both are
   * small display images rather than the original video files.
   */
  generateBannerUploadUrl: async (
    clerkUserId: string,
    fileExtension: string,
  ) => {
    try {
      const { creatorProfile } = await requireOwnCreatorProfile(clerkUserId);

      const blobName = `banners/${creatorProfile.id}/${randomUUID()}.${fileExtension}`;
      const uploadUrl = await AzureStorageService.generateUploadSasUrl(
        'thumbnails',
        blobName,
      );

      return { uploadUrl, blobName, container: 'thumbnails' as const };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to generate banner upload URL', error);
    }
    },
  
  
  confirmBannerUpload: async (clerkUserId: string, blobName: string) => {
    try {
      const { creatorProfile } = await requireOwnCreatorProfile(clerkUserId);

      const exists = await AzureStorageService.blobExists("thumbnails", blobName);
      if (!exists) {
        throw new ApiError(400, "Uploaded file not found in storage — upload may have failed");
      }

      let asset;
      try {
        asset = await prisma.mediaAsset.create({
          data: {
            type: "BANNER",
            storageProvider: "AZURE_BLOB",
            container: "thumbnails",
            blobPath: blobName,
            status: "READY",
          },
        });
      } catch (error: any) {
        if (error.code === 'P2002') {
          throw new ApiError(409, "This banner upload has already been confirmed");
        }
        throw error;
      }
        // Replacing an existing banner: the old MediaAsset row is orphaned
      // (bannerAssetId just gets reassigned) — deliberately left as-is for
        // now, matching the same tradeoff the avatar flow already makes.
        const updated = await prisma.creatorProfile.update({    
            where : { id: creatorProfile.id },
            data: { bannerAssetId: asset.id },
        });
        return updated;
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(500, "Failed to confirm banner upload", error);
    }
  },
};
