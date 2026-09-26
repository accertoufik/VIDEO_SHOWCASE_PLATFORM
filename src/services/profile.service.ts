import { randomUUID } from "node:crypto";
import { prisma } from "../config/db";
import { AzureStorageService } from "./azure-storage.service";
import { ApiError } from "../middleware/errorHandler";
import { AccountStatus } from "../../generated/prisma/enums";

export const ProfileService = {
    getByUserName: async (username: string) => {
        try {
            const profile = await prisma.profile.findUnique({
                where: { username },
                include: {
                    user: {
                        select: { role: true, accountStatus: true, createdAt: true }
                    },
                    avatarAsset: true,
                },
            });
            if (!profile || profile.user.accountStatus !== AccountStatus.ACTIVE) {
                throw new ApiError(404, `No Profile found for username ${username}. Account is blocked.`);
            }
            return profile;
        }
        catch (error) {
            if(error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, "Failed to get profile by username", error);
        }
    },

    updateOwnProfile: async (clerkUserId: string, updates: { displayName?: string; biography?: string; }) => {
        try {
            const user = await prisma.user.findUnique({
                where: { clerkUserId },
                include: { profile: true },
            });
            if(! user || !user.profile) {
                throw new ApiError(404, "user not found or profile not found for the user");
            }
            const profile = await prisma.profile.update({
                where: { userId: user.id },
                data: updates,
            });
            return profile;
        } catch (error) {
            if(error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, "Failed to update own profile", error);
        }
    },

    generateAvatarUploadUrl: async (clerkUserId: string, fileExtension: string) => {
        try {
            const user = await prisma.user.findUnique({
                where: { clerkUserId },
                include: { profile: true },
            });
            if(! user || !user.profile) {
                throw new ApiError(404, "user not found or profile not found for the user");
            }
            const blobName = `avatars/${user.id}/${randomUUID()}.${fileExtension}`;
            const uploadUrl = await AzureStorageService.generateUploadSasUrl("thumbnails", blobName);
            return { uploadUrl, blobName, container: "thumbnails" as const };
        } catch (error) {
            if(error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, "Failed to generate avatar upload URL", error);
        }
    },

    becomeCreator: async (clerkUserId: string, channelName: string) => {
        try {
            const user = await prisma.user.findUnique({
                where: { clerkUserId },
                include: { creatorProfile: true },
            });
            if (!user) {
                throw new ApiError(404, "User not found");
            }
            if (user.creatorProfile) {
                throw new ApiError(409, "User is already a creator");
            }

            const existingChannel = await prisma.creatorProfile.findUnique({
                where: { channelName },
            });
            if (existingChannel) {
                throw new ApiError(409, "Channel name is already taken");
            }

            const [, creatorProfile] = await prisma.$transaction([
                prisma.user.update({
                    where: { id: user.id },
                    data: { role: "CREATOR" },
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
            throw new ApiError(500, "Failed to create creator profile", error);
        }
    },

    confirmAvatarUpload: async (clerkUserId: string, blobName: string) => {
        try {
           const user = await prisma.user.findUnique({
                where: { clerkUserId },
                include: { profile: true },
            });
            if(! user || !user.profile) {
                throw new ApiError(404, "user not found or profile not found for the user");
            }
            const exists = await AzureStorageService.blobExists("thumbnails", blobName);
            if(!exists) {
                throw new ApiError(400, "Uploaded avatar file does not exist in storage-upload may have failed or been deleted");
            }

            const asset = await prisma.mediaAsset.create({
                data: {
                    type: "AVATAR",
                    storageProvider: "AZURE_BLOB",
                    container: "thumbnails",
                    blobPath: blobName,
                    status: "READY",
                },
            });
           const profile = await prisma.profile.update({
                where: { userId: user.id },
                data: { avatarAssetId: asset.id },
            });
            return profile;
        }catch (error) {
            if(error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, "Failed to confirm avatar upload", error);
        }
    }
}