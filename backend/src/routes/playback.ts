import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { sendSuccessResponse } from "../lib/apiResponse";
import { asyncHandler } from "../lib/asyncHandler";
import { streamRateLimiter } from "../middleware/ratelimit";
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


/**
 * The app draws captions itself (its own style), so the playlist the PLAYER loads must not declare the subtitle group,
 * or the player would also render its own boxed copy. The caption list is still available with ?subs=1.
 */
const stripSubtitles = (master: string) =>
    master
        .split("\n")
        .filter((line) => !line.startsWith("#EXT-X-MEDIA:TYPE=SUBTITLES"))
        .join("\n")
        .replace(/,SUBTITLES="[^"]*"/g, "");

/** Drops every rung of a master playlist except `label` (keeps subtitle lines and the header). */
const keepOnlyRung = (master: string, label: string) => {
    const lines = master.split("\n");
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i] ?? "";
        if (line.startsWith("#EXT-X-STREAM-INF")) {
            const uri = lines[i + 1] ?? "";
            if (uri.trim() === `${label}/playlist.m3u8`) out.push(line, uri);
            i++; // the URI line belongs to this entry either way
        } else {
            out.push(line);
        }
    }
    const result = out.join("\n");
    // Unknown rung: fall back to the full master rather than an empty (unplayable) one.
    return result.includes("playlist.m3u8") ? result : master;
};

// Finished playlist text, kept briefly. The master changes when HD is added, so it is kept for less time; a rung
// playlist never changes once encoding is done. Both stay far below the 60+ minutes a signed segment URL is valid.
const MASTER_TTL_MS = 20_000;
const RUNG_TTL_MS = 2 * 60_000;
const playlistCache = {
    entries: new Map<string, { text: string; expires: number }>(),
    get(key: string) {
        const hit = this.entries.get(key);
        if (!hit) return undefined;
        if (hit.expires < Date.now()) {
            this.entries.delete(key);
            return undefined;
        }
        return hit.text;
    },
    set(key: string, text: string, ttlMs: number) {
        if (this.entries.size >= 500) this.entries.delete(this.entries.keys().next().value as string); // bounded
        this.entries.set(key, { text, expires: Date.now() + ttlMs });
    },
};

/** Replaces every relative file entry of a media playlist with an absolute, signed storage URL. */
const signSegmentLines = async (playlist: string, baseName: string, playlistPath: string) => {
    const dir = path.posix.dirname(playlistPath); // e.g. "720p" (or "." for a playlist at the top level)
    const sign = (file: string) =>
        /^https?:\/\//i.test(file) ? file : PlaybackService.signStreamPath(baseName, path.posix.join(dir === "." ? "" : dir, file));
    const lines = await Promise.all(
        playlist.split("\n").map(async (raw) => {
            const line = raw.trim();
            if (!line) return raw;
            if (line.startsWith("#")) {
                // e.g. #EXT-X-MAP:URI="init.mp4"
                const match = /URI="([^"]+)"/.exec(line);
                return match ? raw.replace(match[1] as string, await sign(match[1] as string)) : raw;
            }
            return sign(line);
        }),
    );
    return lines.join("\n");
};

playbackRouter.get(
    "/videos/:videoId/stream/*subPath",
    streamRateLimiter,
    optionalAuth,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const subPathParam = req.params.subPath;
        const subPath = Array.isArray(subPathParam) ? subPathParam.join("/") : subPathParam;
        if (!subPath) {
            throw new ApiError(400, "Missing subPath parameter");
        }

        // "master-720p.m3u8" is the master playlist narrowed to one rung. The app uses it when a viewer picks a quality,
        // so the captions menu (declared in the master) is still there; a bare rung playlist has no subtitles.
        const singleRung = /^master-(\d{3,4}p)\.m3u8$/.exec(subPath)?.[1];

        const videoId = requireVideoId(req.params.videoId);
        const baseName = await PlaybackService.getStreamBase(videoId, req.auth?.userId);
        const target = singleRung ? "master.m3u8" : subPath;

        // Segments (and subtitle files): redirect straight to a freshly signed storage URL.
        if (!target.toLowerCase().endsWith(".m3u8")) {
            res.redirect(302, await PlaybackService.signStreamPath(baseName, target));
            return;
        }

        // Playlists are served as text, NOT redirected: their entries are relative, and after a 302 the player would
        // resolve them against the bare (unsigned) blob URL. The finished text is cached for a short while, so many
        // viewers of the same video cost one storage fetch, not one each.
        const isMaster = Boolean(singleRung) || target === "master.m3u8";
        const cacheKey = `${baseName}|${target}|${singleRung ?? ""}|${req.query.subs === "1" ? "s" : ""}`;
        let text = playlistCache.get(cacheKey);
        if (text === undefined) {
            const upstream = await fetch(await PlaybackService.signStreamPath(baseName, target));
            if (!upstream.ok) throw new ApiError(404, "Playlist not found");
            text = await upstream.text();
            if (singleRung) text = keepOnlyRung(text, singleRung);
            if (isMaster && req.query.subs !== "1") text = stripSubtitles(text);
            // A rung playlist lists its segments. Point each one straight at storage with its own signed URL, so
            // the segments (a request every few seconds per viewer) never touch this server at all.
            if (!isMaster) text = await signSegmentLines(text, baseName, target);
            playlistCache.set(cacheKey, text, isMaster ? MASTER_TTL_MS : RUNG_TTL_MS);
        }
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
        res.setHeader("Cache-Control", "no-store");
        res.status(200).send(text);
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
