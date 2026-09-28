import path from "path";
import { prisma } from "../config/db";
import { AzureStorageService } from "./azure-storage.service";
import { VideoService } from "./video.service";
import { ApiError } from "../middleware/errorHandler";

export const PlaybackService = {
    /**
     * Turns "give me file X for this video" into a signed, short-lived
     * Azure URL. Re-runs the same visibility check as GET /api/videos/:id
     * so a private/unlisted video's segments can't be pulled directly even
     * if someone guesses the blob path.
     */

    getStreamRedirectUrl: async (
        videoId: string,
        subPath: string,
        viewerClerkUserId: string | undefined,
    ) => {
        const video = await VideoService.getById(videoId, viewerClerkUserId);

        if (!video.hlsManifestAssetId) {
            throw new ApiError(
                404,
                'Video has not processed yet, or does not have an HLS manifest.',
            );
        }

        const hlsManifestAsset = await prisma.mediaAsset.findUniqueOrThrow({
            where: { id: video.hlsManifestAssetId },
        });

        // hlsManifestAsset.blobPath looks like "<baseName>/master.m3u8" — strip
        // the filename to get the folder every rung/segment lives under.
        const baseName = hlsManifestAsset.blobPath.replace(/\/[^/]+$/, '');

        // The subPath is the rest of the URL after the video ID, e.g.:
        //   "master.m3u8" or "480p/segment-00001.ts"
        const blobPath = path.posix.normalize(`${baseName}/${subPath}`);
        if (!blobPath.startsWith(`${baseName}/`)) {
            throw new ApiError(400, 'Invalid path');
        }
        try {
            return await AzureStorageService.generateReadSasUrl(
                'processed',
                blobPath,
                10, // seconds until the signed URL expires
            );
        } catch (error) {
            throw new ApiError(404, 'Request File not found', error);
        }
    },

    /** Called once when a viewer starts playing — logs the view, bumps the counter. */
    recordWatchStart: async (videoId: string, ClerkUserId: string) => {
        const user = await prisma.user.findUnique({ where: { clerkUserId: ClerkUserId } });
        if (!user) throw new ApiError(404, "User not found");
        
        await prisma.$transaction([
            prisma.watchHistory.create({
                data: {
                    userId: user.id,
                    videoId: videoId,
                },
            }),
            prisma.video.update({
                where: { id: videoId },
                data: { viewCount: { increment: 1 } },
            }),
        ]);
    },

    /** upsert the viewer's resume position - called periodically during playback */
    saveProgress: async (videoId: string, ClerkUserId: string, input: { positionMs: number; completionPercent?: number, completed?: boolean }) => {
        const user = await prisma.user.findUnique({ where: { clerkUserId: ClerkUserId } });
        if (!user) throw new ApiError(404, "User not found");


        return await prisma.watchProgress.upsert({
            where: { userId_videoId: { userId: user.id, videoId: videoId } },
            update: {
                positionMs: input.positionMs,
                completionPercent: input.completionPercent ?? 0,
                completed: input.completed ?? false,
            },
            create: {
                userId: user.id,
                videoId: videoId,
                positionMs: input.positionMs,
                completionPercent: input.completionPercent ?? 0,
                completed: input.completed ?? false,
            },
        });
    },

    /** get the viewer's resume position - called when the video page is loaded */
    getProgress: async (videoId: string, ClerkUserId: string) => {
        const user = await prisma.user.findUnique({ where: { clerkUserId: ClerkUserId } });
        if (!user) throw new ApiError(404, "User not found");

        return await prisma.watchProgress.findUnique({
            where: { userId_videoId: { userId: user.id, videoId: videoId } },
        });
    },
};