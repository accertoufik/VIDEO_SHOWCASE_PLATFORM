import path from "path";
import { prisma } from "../config/db";
import { AzureStorageService } from "./azure-storage.service";
import { VideoService } from "./video.service";
import { ApiError } from "../middleware/errorHandler";

const PUBLIC_STREAM_CACHE_MS = 30_000;
const publicStreamBase = new Map<string, { baseName: string; expires: number }>();
const viewerStreamBase = new Map<string, { baseName: string; expires: number }>();

/** The subPath is the rest of the URL after the video ID, e.g. "master.m3u8" or "480p/480p0.ts". */
const signStreamPath = async (baseName: string, subPath: string) => {
    const blobPath = path.posix.normalize(`${baseName}/${subPath}`);
    if (!blobPath.startsWith(`${baseName}/`)) {
        throw new ApiError(400, 'Invalid path');
    }
    try {
        return await AzureStorageService.generateReadSasUrl(
            'processed',
            blobPath,
            10, // minutes until the signed URL expires
        );
    } catch (error) {
        throw new ApiError(404, 'Request File not found', error);
    }
};

export const PlaybackService = {
    /**
     * Turns "give me file X for this video" into a signed, short-lived
     * Azure URL. Re-runs the same visibility check as GET /api/videos/:id
     * so a private/unlisted video's segments can't be pulled directly even
     * if someone guesses the blob path.
     */

    /**
     * The storage folder ("baseName") a video's HLS files live under, after the visibility check. Every playlist and
     * segment request needs this, and the check costs two database round trips, so the answer is remembered briefly:
     * once per video for PUBLIC videos, and once per viewer + video for the rest (a private video is still only ever
     * handed to someone who passed the full check).
     */
    getStreamBase: async (videoId: string, viewerClerkUserId: string | undefined): Promise<string> => {
        const publicHit = publicStreamBase.get(videoId);
        if (publicHit && publicHit.expires > Date.now()) return publicHit.baseName;

        const viewerKey = `${videoId}:${viewerClerkUserId ?? 'anon'}`;
        const viewerHit = viewerStreamBase.get(viewerKey);
        if (viewerHit && viewerHit.expires > Date.now()) return viewerHit.baseName;

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

        // hlsManifestAsset.blobPath looks like "<baseName>/master.m3u8": strip the filename to get the folder every
        // rung/segment lives under.
        const baseName = hlsManifestAsset.blobPath.replace(/\/[^/]+$/, '');

        if (video.visibility === 'PUBLIC') {
            publicStreamBase.set(videoId, { baseName, expires: Date.now() + PUBLIC_STREAM_CACHE_MS });
        } else {
            if (viewerStreamBase.size > 2000) viewerStreamBase.clear(); // bounded
            viewerStreamBase.set(viewerKey, { baseName, expires: Date.now() + PUBLIC_STREAM_CACHE_MS });
        }
        return baseName;
    },

    /** A short-lived signed Azure URL for one file of a video. Signing is local maths: no network call. */
    signStreamPath,

    getStreamRedirectUrl: async (
        videoId: string,
        subPath: string,
        viewerClerkUserId: string | undefined,
    ) => signStreamPath(await PlaybackService.getStreamBase(videoId, viewerClerkUserId), subPath),

    /** Called once when a viewer starts playing — logs the play; bumps the counter only for an account's first watch. */
    recordWatchStart: async (videoId: string, ClerkUserId: string) => {
        // 404s for deleted / not-visible videos, so views can't be inflated on private ones.
        await VideoService.getById(videoId, ClerkUserId);
        const user = await prisma.user.findUnique({ where: { clerkUserId: ClerkUserId } });
        if (!user) throw new ApiError(404, "User not found");
        
        // Every play still lands in the viewer's history (that's what orders "recently watched"), but the public
        // view counter goes up only the FIRST time this account watches this video. Watching it again, or
        // replaying it, must not inflate the count.
        const alreadyCounted = await prisma.watchHistory.findFirst({
            where: { userId: user.id, videoId },
            select: { id: true },
        });

        await prisma.$transaction([
            prisma.watchHistory.create({
                data: {
                    userId: user.id,
                    videoId: videoId,
                },
            }),
            ...(alreadyCounted
                ? []
                : [
                      prisma.video.update({
                          where: { id: videoId },
                          data: { viewCount: { increment: 1 } },
                      }),
                  ]),
        ]);
    },

    /** upsert the viewer's resume position - called periodically during playback */
    saveProgress: async (videoId: string, ClerkUserId: string, input: { positionMs: number; completionPercent?: number, completed?: boolean }) => {
        const user = await prisma.user.findUnique({ where: { clerkUserId: ClerkUserId } });
        if (!user) throw new ApiError(404, "User not found");
        await VideoService.getById(videoId, ClerkUserId);

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