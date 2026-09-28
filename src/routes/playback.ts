import { Router } from "express";
import { z } from "zod";
import { sendSuccessResponse } from "../lib/apiResponse";
import { asyncHandler } from "../lib/asyncHandler";
import { PlaybackService } from "../services/playback.service";
import { ApiError } from "../middleware/errorHandler";
import { optionalAuth, authenticateUser, type AuthenticatedRequest } from "../middleware/auth";

export const playbackRouter = Router();

function requireVideoId(param: string | string[] | undefined): string {
    if (typeof param !== "string" || !param) {
        throw new ApiError(400, "Missing videoId parameter");
    }
    return param;
}


/**
 * GET /api/videos/:videoId/stream/*subPath
 * The player requests everything through this one route — the master
 * manifest, each rung's playlist, and every .ts segment — and we
 * redirect to a freshly-signed Azure URL each time. Auth is optional so
 * PUBLIC videos stream for anonymous viewers too.
 */


playbackRouter.get(
    "/videos/:videoId/stream/*subPath",
    optionalAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const subPathParam = req.params.subPath;
        const subPath = Array.isArray(subPathParam) ? subPathParam.join("/") : subPathParam;
        if (!subPath) {
            throw new ApiError(400, "Missing subPath parameter");
        }

        const redirectUrl = await PlaybackService.getStreamRedirectUrl(
            requireVideoId(req.params.videoId),
            subPath,
            req.auth?.userId,
        );
        res.redirect(302, redirectUrl);
    }),
);
/**
 * POST /api/videos/:videoId/watch
 * Call once when playback actually starts (not on every progress tick).
 */ 
playbackRouter.post(
    "/videos/:videoId/watch",
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const clerkUserId = req.auth?.userId;
        if (!clerkUserId) {
            throw new ApiError(401, "Unauthorized");
        }

        await PlaybackService.recordWatchStart(requireVideoId(req.params.videoId), clerkUserId);
        sendSuccessResponse(res, { recorded: true }, 201);
    })
);

const progressSchema = z.object({
    positionMs: z.number().int().nonnegative(),
    completionPercent: z.coerce.number().min(0).max(100).optional(),
    completed:z.coerce.boolean().optional(),
});

/**
 * PATCH /api/videos/:videoId/progress
 * Call periodically (e.g. every 10-15s) while the video plays.
 */
playbackRouter.patch(
    "/videos/:videoId/progress",
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const clerkUserId = req.auth?.userId;
        if (!clerkUserId) {
            throw new ApiError(401, "Unauthorized");
        }

        const parsed = progressSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ApiError(400, "Invalid progress update", z.treeifyError(parsed.error)   );
        }
        const progress = await PlaybackService.saveProgress(requireVideoId(req.params.videoId), clerkUserId, parsed.data);
        sendSuccessResponse(res, { message: "Progress recorded" });
    })
);

/**
 * GET /api/videos/:videoId/progress
 * Called when the player loads a video, to know where to resume from.
 */
playbackRouter.get(
    "/videos/:videoId/progress",
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const clerkUserId = req.auth?.userId;
        if (!clerkUserId) {
            throw new ApiError(401, "Unauthorized");
        }

        const progress = await PlaybackService.getProgress(requireVideoId(req.params.videoId), clerkUserId);
        sendSuccessResponse(res, { progress });
    })
);
