import "dotenv/config";
import { prisma } from "../config/db";
import { JobService } from "../services/job.service";
import { MediaProcessingService } from "../services/media-processing.service";
import { NotificationService } from "../services/notification.service";
import { classifyVideoFormat } from '../lib/videoClassification';
import { isCancelled, jobContext } from '../lib/jobContext';
import { mediaBaseName } from '../lib/mediaPaths';
import { deleteStorageTargets } from '../services/video-delete.service';

/**
 * This file is a SEPARATE PROCESS from the API server — you run it with
 * its own terminal/command (`bun run worker`), not as part of `bun run
 * dev`. It never receives HTTP requests. Its only job is to loop forever,
 * asking the database "is there queued work?", and doing the slow FFmpeg
 * work when there is. This is why encoding a video never blocks anyone
 * trying to use the API at the same time.
 */

// A RUNNING job older than this is assumed orphaned by a crashed worker and is re-queued (bounded retries).
const STALE_JOB_MS = Number(process.env.STALE_JOB_MINUTES ?? 90) * 60 * 1000;
const POLL_INTERVAL_MS = 5000; // how often to check for new work when idle

// How many jobs a single tick will claim and run AT THE SAME TIME (via
// Promise.all), instead of one job per tick. This is what actually
// parallelizes processing without needing extra worker processes: a
// video's TRANSCODE_STANDARD, TRANSCODE_1080P, TRANSCODE_1440P and
// THUMBNAIL jobs — or jobs belonging to entirely different videos — can
// now run concurrently. Tune this to your server's CPU count; FFmpeg
// encoding is CPU-heavy, so setting this far above your core count won't
// help and may slow everything down via contention.
const WORKER_CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? 3);

// Adaptive grace window: scales with the video's own duration instead of
// using one flat number for every upload. A 3-minute clip and a 90-minute
// upload should not wait the same number of minutes for HD to finish.
const HD_GRACE_MIN_MS = Number(process.env.HD_GRACE_MIN_MINUTES ?? 5) * 60 * 1000;
const HD_GRACE_MAX_MS = Number(process.env.HD_GRACE_MAX_MINUTES ?? 45) * 60 * 1000;
const HD_GRACE_DURATION_FACTOR = Number(process.env.HD_GRACE_DURATION_FACTOR ?? 0.5);
const HD_GRACE_FALLBACK_MS = Number(process.env.HD_GRACE_FALLBACK_MINUTES ?? 15) * 60 * 1000;

/**
 * Computes how long to wait for HD to finish before sending the SD-only
 * notification separately, scaled to the video's own runtime.
 *
 * - No known duration (ffprobe failed, or a pre-existing row) -> fallback constant.
 * - Otherwise -> durationMs * FACTOR, clamped to [MIN, MAX].
 *
 * Example with defaults (factor 0.5, min 5m, max 45m):
 *   3-minute clip   -> 1.5m -> clamped up to 5m
 *   20-minute video -> 10m
 *   90-minute video -> 45m -> clamped down to 45m
 */
const getGraceWindowMs = (durationMs: bigint | null): number => {
    if (durationMs == null || Number(durationMs) <= 0) return HD_GRACE_FALLBACK_MS;
    const scaled = Number(durationMs) * HD_GRACE_DURATION_FACTOR;
    return Math.min(HD_GRACE_MAX_MS, Math.max(HD_GRACE_MIN_MS, scaled));
};

interface Job {
    id: string;
    videoId: string;
    type: "TRANSCODE_STANDARD" | "TRANSCODE_1080P" | "TRANSCODE_1440P" | "THUMBNAIL" | "PREVIEW";
}

/**
 * PHASE 1 of transcoding: the 480p/720p rungs, encoded in parallel (see
 * MediaProcessingService.transcodeStandard). This is what a video needs
 * before it can be watched at all.
 */
const processTranscodeStandardJob = async (job: Job) => {
    try {
        const video = await prisma.video.findUnique({
            where: { id: job.videoId },
            include: { originalAsset: true },
        });

        if (!video || !video.originalAsset) {
            throw new Error(`Video or original asset not found for job ${job.id}`);
        }

        const { masterBlobPath, variants, hdRungsNeeded, durationMs, width, height } = await MediaProcessingService.transcodeStandard(video.originalAsset.blobPath);

        const manifestAsset = await prisma.mediaAsset.create({
            data: {
                type: "HLS_MASTER_MANIFEST",
                storageProvider: "AZURE_BLOB",
                container: "processed",
                blobPath: masterBlobPath,
                status: "READY",
            },
        });

        for (const variant of variants) {
            const asset = await prisma.mediaAsset.create({
                data: {
                    type: "HLS_MASTER_MANIFEST",
                    storageProvider: "AZURE_BLOB",
                    container: "processed",
                    blobPath: variant.blobPath,
                    status: "READY",
                },
            });

            await prisma.videoVariant.create({
                data: {
                    videoId: video.id,
                    assetId: asset.id,
                    label: variant.label,
                    width: variant.width,
                    height: variant.height,
                    bitrateKbps: variant.bitrateKbps,
                    status: "READY",
                },
            });
        }

        // The AUTHORITATIVE short-vs-long decision. Runs before the video can
        // reach READY (this job is a prerequisite for that), so there is
        // never a window where a public video carries the creator's
        // unverified label from initUpload.
        const type = classifyVideoFormat({ width, height, durationMs });
        console.log(`Video ${video.id} classified ${type} (${width}x${height}, ${durationMs}ms)`);

        await prisma.video.update({
            where: { id: video.id },
            data: {
                hlsManifestAssetId: manifestAsset.id,
                type,
                width,
                height,
                // If the source could never produce ANY HD rung, treat it as
                // HD-complete immediately so it doesn't sit waiting for a
                // notification that will never come.
                ...(hdRungsNeeded.length === 0 ? { hdReady: true } : {}),
                ...(durationMs > 0 ? { durationMs: BigInt(durationMs) } : {}),
            },
        });

        // Now that we actually know the source's resolution, create ONLY
        // the HD job(s) it actually qualifies for — e.g. a 1080p source
        // gets a TRANSCODE_1080P row and no TRANSCODE_1440P row at all.
        // This is the real fix for the earlier race: since no job row
        // exists for a non-qualifying rung, there's nothing for the
        // worker to claim and waste a download+ffprobe on in the first
        // place — not even in the same tick as this job.
        await JobService.enqueueHdJobsIfNeeded(video.id, hdRungsNeeded);

        await JobService.markSucceeded(job.id);
    } catch (error) {
        if (isCancelled(error)) return; // the video was deleted: dispatch() cleans up
        console.error(`Error processing job ${job.id}:`, error);
        await JobService.markFailed(
            job.id,
            error instanceof Error ? error.message : String(error),
        );
    }
};

/** Shared by both HD job handlers below — creates the MediaAsset + VideoVariant rows for one produced rung. */
const recordHdVariant = async (
    videoId: string,
    variant: { label: string; width: number; height: number; bitrateKbps: number; blobPath: string },
) => {
    const asset = await prisma.mediaAsset.create({
        data: {
            type: "HLS_MASTER_MANIFEST",
            storageProvider: "AZURE_BLOB",
            container: "processed",
            blobPath: variant.blobPath,
            status: "READY",
        },
    });
    await prisma.videoVariant.create({
        data: {
            videoId,
            assetId: asset.id,
            label: variant.label,
            width: variant.width,
            height: variant.height,
            bitrateKbps: variant.bitrateKbps,
            status: "READY",
        },
    });
};

/**
 * PHASE 2a — the FIRST/minimum HD rung. This is the one that matters for
 * notifications: finishing this is what tells the creator "HD is ready",
 * regardless of whether a slower 1440p job is still running. Runs
 * completely independently of TRANSCODE_STANDARD and TRANSCODE_1440P — it
 * never blocks the video from going READY (or PUBLIC) at standard quality
 * first, and it never waits on 1440p.
 */
const processTranscode1080pJob = async (job: Job) => {
    try {
        const video = await prisma.video.findUnique({
            where: { id: job.videoId },
            include: { originalAsset: true },
        });
        if (!video || !video.originalAsset) throw new Error("Video or original asset not found");

        const result = await MediaProcessingService.transcodeHdRung(video.originalAsset.blobPath, "1080p");
        if (result.added) await recordHdVariant(video.id, result.variant);

        if (result.added) {
            // Atomic guard: a retried job (already succeeded once before)
            // gets count 0 and correctly no-ops — same atomic-updateMany
            // pattern used everywhere else in this project. The actual "HD
            // is ready" notification is NOT sent here — it's decided by
            // deliverReadyNotifications()/deliverHdFollowUpNotifications(),
            // which apply the adaptive grace window every worker tick.
            await prisma.video.updateMany({
                where: { id: video.id, hdReady: false },
                data: { hdReady: true },
            });
        }

        await JobService.markSucceeded(job.id);
    } catch (error) {
        if (isCancelled(error)) return;
        // Not fatal to the video — 480p/720p already play fine, and it may
        // already be PUBLIC. Just means hdReady never flips true, so no
        // "HD ready" notification fires until this is retried/fixed.
        console.error(`Error processing 1080p job ${job.id}:`, error);
        await JobService.markFailed(
            job.id,
            error instanceof Error ? error.message : String(error),
        );
    }
};

/**
 * PHASE 2b — the HIGHER HD rung (1440p), handled DELIBERATELY differently
 * from 1080p above: it records its variant and amends the manifest same
 * as always, but it NEVER sends a notification and NEVER touches
 * hdReady. If 1440p finishes after the "HD is ready" notification already
 * fired for 1080p, nothing further is announced — the creator (and any
 * viewer) simply sees 1440p appear in the video's variant list / manifest
 * the next time they reload or re-fetch it. Runs fully independently of
 * the 1080p job, even though both can be encoding at the exact same
 * moment.
 */
const processTranscode1440pJob = async (job: Job) => {
    try {
        const video = await prisma.video.findUnique({
            where: { id: job.videoId },
            include: { originalAsset: true },
        });
        if (!video || !video.originalAsset) throw new Error("Video or original asset not found");

        const result = await MediaProcessingService.transcodeHdRung(video.originalAsset.blobPath, "1440p");

        if (result.added) {
            await recordHdVariant(video.id, result.variant);
            console.log(`1440p rung added for video ${video.id} (silent — no notification, no hdReady change).`);
        }

        await JobService.markSucceeded(job.id);
    } catch (error) {
        if (isCancelled(error)) return;
        // Not fatal — 480p/720p (and possibly 1080p) already play fine.
        console.error(`Error processing 1440p job ${job.id}:`, error);
        await JobService.markFailed(
            job.id,
            error instanceof Error ? error.message : String(error),
        );
    }
};

/** Same pattern as before — the single thumbnail image, unaffected by the standard/HD split. */
const processThumbnailJob = async (job: Job) => {
    try {
        const video = await prisma.video.findUnique({
            where: { id: job.videoId },
            include: { originalAsset: true },
        });

        if (!video || !video.originalAsset) {
            throw new Error(`Video or original asset not found for job ${job.id}`);
        }

        // A creator may have already uploaded a custom thumbnail (via
        // /videos/:videoId/thumbnail/confirm) before this job runs — cheap
        // early-out for the common case, but not race-safe on its own since
        // the confirm could land between this read and the write below.
        if (video.thumbnailIsCustom) {
            await JobService.markSucceeded(job.id);
            return;
        }

        const thumbnailBlobPath = await MediaProcessingService.generateThumbnail(video.originalAsset.blobPath);

        const thumbnailAsset = await prisma.mediaAsset.create({
            data: {
                type: "THUMBNAIL",
                storageProvider: "AZURE_BLOB",
                container: "thumbnails",
                blobPath: thumbnailBlobPath,
                status: "READY",
            },
        });

        // Atomic conditional update — a separate read-then-write here has a
        // proven race against the creator's POST /thumbnail/confirm.
        // updateMany's WHERE is evaluated by the database as part of the
        // same write, so there's no gap left for another request to land in.
        const result = await prisma.video.updateMany({
            where: { id: video.id, thumbnailIsCustom: false },
            data: { thumbnailAssetId: thumbnailAsset.id },
        });

        if (result.count === 0) {
            console.log(`Skipped auto-thumbnail for video ${video.id} — creator already set a custom one.`);
        }

        await JobService.markSucceeded(job.id);
    } catch (error) {
        if (isCancelled(error)) return; // the video was deleted: dispatch() cleans up
        console.error(`Error processing thumbnail job ${job.id}:`, error);
        await JobService.markFailed(
            job.id,
            error instanceof Error ? error.message : String(error),
        );
    }
};

/**
 * Called after TRANSCODE_STANDARD or THUMBNAIL finishes. Once BOTH are
 * done for a video, flips it to READY (watchable at 480p/720p) — or
 * FAILED if either failed — and, on success, stamps standardReadyAt to
 * start the grace-window clock. Deliberately does NOT wait on
 * TRANSCODE_1080P or TRANSCODE_1440P — that's the whole point of the
 * split.
 *
 * The status flip uses an atomic conditional updateMany (WHERE status =
 * "PROCESSING") rather than a plain update, because with concurrent job
 * dispatch (WORKER_CONCURRENCY below) this function can genuinely be
 * called twice back to back — e.g. TRANSCODE_STANDARD and THUMBNAIL both
 * finishing in the same tick. The WHERE clause guarantees only the first
 * caller actually transitions the video.
 *
 * Notifications are NOT sent here anymore — see deliverReadyNotifications()
 * below, which runs every worker tick and applies the grace window.
 *
 * Note: this does NOT flip visibility and does NOT notify followers —
 * the video stays PRIVATE at this point. That only happens once the
 * creator explicitly calls POST /videos/:videoId/publish
 * (VideoService.publish), which is also what fans the "new video" out to
 * followers.
 */
const markStandardReadyIfDone = async (videoId: string) => {
    const outstanding = await prisma.mediaProcessingJob.count({
        where: { videoId, type: { in: ["TRANSCODE_STANDARD", "THUMBNAIL"] }, status: { in: ["QUEUED", "RUNNING"] } },
    });
    if (outstanding > 0) return; // still waiting on 480p/720p or the thumbnail

    const anyFailed = await prisma.mediaProcessingJob.count({
        where: { videoId, type: { in: ["TRANSCODE_STANDARD", "THUMBNAIL"] }, status: "FAILED" },
    });
    const nextStatus = anyFailed > 0 ? "FAILED" : "READY";

    await prisma.video.updateMany({
        where: { id: videoId, status: "PROCESSING" },
        data:
            nextStatus === "READY"
                ? { status: nextStatus, standardReadyAt: new Date() }
                : { status: nextStatus },
    });
    // No count check needed here — deliverReadyNotifications() below is
    // itself guarded by readyNotificationSent, so even if this updateMany
    // matched zero rows (another concurrent call already handled it),
    // nothing downstream double-fires.
};

/**
 * Runs every worker tick. Sends exactly ONE "your video is ready" style
 * notification per video, using the adaptive grace window to decide
 * whether to combine the SD-ready and HD-ready news into a single
 * notification or split them into two.
 *
 * - If HD already finished by the time we check -> one combined
 *   notification, and hdNotificationSent is also marked true (no
 *   follow-up needed).
 * - If HD hasn't finished but we're still inside the grace window for
 *   this video's own duration -> wait, check again next tick.
 * - If the grace window has elapsed and HD still isn't ready -> send the
 *   SD-only notification now; deliverHdFollowUpNotifications() will send
 *   the HD one later when it actually finishes.
 */
const deliverReadyNotifications = async () => {
    const candidates = await prisma.video.findMany({
        where: {
            standardReadyAt: { not: null },
            readyNotificationSent: false,
            status: { in: ["READY", "PUBLISHED"] },
        },
    });

    for (const video of candidates) {
        const creator = await prisma.creatorProfile.findUnique({
            where: { id: video.creatorId },
            include: { user: true },
        });
        if (!creator) continue;

        if (video.hdReady) {
            const claimed = await prisma.video.updateMany({
                where: { id: video.id, readyNotificationSent: false },
                data: { readyNotificationSent: true, hdNotificationSent: true },
            });
            if (claimed.count === 1) {
                await NotificationService.create({
                    recipientId: creator.user.id,
                    actorId: creator.user.id,
                    type: "SYSTEM",
                    title: "Your video is fully ready",
                    body: `"${video.title}" is fully ready, including HD quality.`,
                    videoId: video.id,
                    creatorId: video.creatorId,
                    payload: null,
                });
            }
            continue;
        }

        const elapsedMs = Date.now() - video.standardReadyAt!.getTime();
        const graceWindowMs = getGraceWindowMs(video.durationMs);

        if (elapsedMs < graceWindowMs) {
            continue; // still inside this video's own grace window — wait
        }

        const claimed = await prisma.video.updateMany({
            where: { id: video.id, readyNotificationSent: false },
            data: { readyNotificationSent: true },
        });
        if (claimed.count === 1) {
            await NotificationService.create({
                recipientId: creator.user.id,
                actorId: creator.user.id,
                type: "SYSTEM",
                title: "Your video is ready to preview",
                body: `"${video.title}" is ready to preview in 480p/720p — you can publish it now. HD is still processing.`,
                videoId: video.id,
                creatorId: video.creatorId,
                payload: null,
            });
        }
    }
};

/**
 * Runs every worker tick. Catches the slow-path case where the SD
 * notification already went out (grace window elapsed) but HD has since
 * finished — sends the standalone "HD is ready" follow-up exactly once.
 */
const deliverHdFollowUpNotifications = async () => {
    const candidates = await prisma.video.findMany({
        where: {
            hdReady: true,
            hdNotificationSent: false,
            readyNotificationSent: true,
        },
    });

    for (const video of candidates) {
        const creator = await prisma.creatorProfile.findUnique({
            where: { id: video.creatorId },
            include: { user: true },
        });
        if (!creator) continue;

        const claimed = await prisma.video.updateMany({
            where: { id: video.id, hdNotificationSent: false },
            data: { hdNotificationSent: true },
        });
        if (claimed.count === 1) {
            await NotificationService.create({
                recipientId: creator.user.id,
                actorId: creator.user.id,
                type: "SYSTEM",
                title: "HD is ready",
                body: `"${video.title}" is now available in HD.`,
                videoId: video.id,
                creatorId: video.creatorId,
                payload: null,
            });
        }
    }
};

/** How often a running job checks that its video still exists. */
const WATCH_INTERVAL_MS = Number(process.env.JOB_WATCH_SECONDS ?? 4) * 1000;

/** Ids of the jobs THIS worker is running right now (so they are never mistaken for stale ones). */
const running = new Set<string>();

/** Removes everything a cancelled job may have written: its files in storage and any rows that point at them. */
const cleanUpAfterCancel = async (baseName: string) => {
    await deleteStorageTargets({
        blobs: [],
        prefixes: [
            { container: "processed", prefix: `${baseName}/` },
            { container: "thumbnails", prefix: `${baseName}/` },
        ],
    });
    await prisma.mediaAsset.deleteMany({
        where: { container: { in: ["processed", "thumbnails"] }, blobPath: { startsWith: `${baseName}/` } },
    });
};

/**
 * Dispatches one claimed job to its handler, then re-checks standard-readiness for its video.
 *
 * While the job runs, a watcher asks the database every few seconds whether the video still exists. When the creator
 * deletes it (the row is gone, or hidden), the job is cancelled: ffmpeg is killed on the spot, nothing more is
 * uploaded, and whatever was already uploaded is removed. So deleting a video that is still "processing" really does
 * stop the worker, instead of letting it finish a long encode for a video nobody can see.
 */
const dispatch = async (job: Job) => {
    console.log(`Processing job ${job.id} (${job.type}) for video ${job.videoId}`);

    // The creator may have deleted the video while this job sat in the queue. Don't burn CPU encoding it.
    const owner = await prisma.video.findUnique({
        where: { id: job.videoId },
        select: { deletedAt: true, originalAsset: { select: { blobPath: true } } },
    });
    if (!owner || owner.deletedAt) {
        await JobService.markFailed(job.id, "Video deleted while job was queued");
        return;
    }
    const baseName = owner.originalAsset ? mediaBaseName(owner.originalAsset.blobPath) : null;

    const controller = new AbortController();
    const watcher = setInterval(() => {
        prisma.video
            .findUnique({ where: { id: job.videoId }, select: { deletedAt: true } })
            .then((video) => {
                if (!video || video.deletedAt) controller.abort();
            })
            .catch(() => {
                // a database hiccup must not cancel a healthy job; the next check tries again
            });
    }, WATCH_INTERVAL_MS);

    const jobStart = Date.now();
    try {
        await jobContext.run({ signal: controller.signal }, async () => {
            if (job.type === "TRANSCODE_STANDARD") await processTranscodeStandardJob(job);
            if (job.type === "TRANSCODE_1080P") await processTranscode1080pJob(job);
            if (job.type === "TRANSCODE_1440P") await processTranscode1440pJob(job);
            if (job.type === "THUMBNAIL") await processThumbnailJob(job);
        });
    } finally {
        clearInterval(watcher);
        console.log(`[timing] job ${job.type} for video ${job.videoId} took ${((Date.now() - jobStart) / 1000).toFixed(1)}s (up to ${WORKER_CONCURRENCY} jobs run at a time)`);
    }

    // Deleted while the job was running (or in its last seconds, after the watcher's last look)?
    const still = await prisma.video.findUnique({ where: { id: job.videoId }, select: { deletedAt: true } });
    if (controller.signal.aborted || !still || still.deletedAt) {
        console.log(`[worker] video ${job.videoId} was deleted while ${job.type} was running: stopped and cleaned up`);
        if (baseName) await cleanUpAfterCancel(baseName);
        return;
    }

    await markStandardReadyIfDone(job.videoId);
};

/** Runs a job to the end without ever letting an error escape (the poll loop must keep going). */
const runJob = async (job: Job) => {
    try {
        await dispatch(job);
    } catch (error) {
        console.error(`[worker] job ${job.id} crashed:`, error);
    } finally {
        running.delete(job.id);
    }
};

/**
 * One iteration of the poll loop: top the running jobs up to WORKER_CONCURRENCY. Jobs run in the background, so a
 * long encode never holds up the others: a short video uploaded while a long film is encoding starts at once (the
 * old loop waited for every job in its batch to finish before it looked at the queue again).
 */
const tick = async () => {
    try {
        const stale = await JobService.requeueStaleJobs(STALE_JOB_MS, 2, [...running]);
        if (stale.requeued || stale.failed) console.warn(`[worker] stale jobs: ${stale.requeued} re-queued, ${stale.failed} failed`);

        while (running.size < WORKER_CONCURRENCY) {
            const job = (await JobService.claimNextQueuedJob()) as Job | null;
            if (!job) break; // nothing else waiting right now
            running.add(job.id);
            void runJob(job);
        }

        // These must run every tick, even when no job was claimed: a video inside its grace window has to be re-checked.
        await deliverReadyNotifications();
        await deliverHdFollowUpNotifications();
    } catch (error) {
        // Even a bug in the bookkeeping above (not FFmpeg itself) shouldn't kill the whole worker: log it and keep polling.
        console.error("Error in tick:", error);
    }
};

/**
 * When the worker is stopped (the autoscaler turned it off, or a new version is being deployed), hand any job it was
 * running back to the queue at once, so the next worker picks it up instead of waiting for it to be declared stale.
 */
const handBackAndExit = async () => {
    try {
        if (running.size > 0) {
            await prisma.mediaProcessingJob.updateMany({
                where: { id: { in: [...running] }, status: "RUNNING" },
                data: { status: "QUEUED", startedAt: null },
            });
            console.log(`[worker] stopping: ${running.size} running job(s) handed back to the queue`);
        }
    } finally {
        process.exit(0);
    }
};
process.on("SIGTERM", () => void handBackAndExit());
process.on("SIGINT", () => void handBackAndExit());

/** The infinite poll loop. This is the only thing that runs when you start the worker. */
const run = async () => {
    console.log(`✓ Video processing worker started, polling every ${POLL_INTERVAL_MS}ms (concurrency: ${WORKER_CONCURRENCY})`);
    while (true) {
        await tick();
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
};

run().catch((err) => {
    console.error("Fatal error in worker:", err);
    process.exit(1);
});
