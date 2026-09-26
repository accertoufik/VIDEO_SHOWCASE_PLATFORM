import "dotenv/config";
import { prisma } from "../config/db";
import { JobService } from "../services/job.service";
import { MediaProcessingService } from "../services/media-processing.service";

/**
 * This file is a SEPARATE PROCESS from the API server — you run it with
 * its own terminal/command (`bun run worker`), not as part of `bun run
 * dev`. It never receives HTTP requests. Its only job is to loop forever,
 * asking the database "is there a queued job?", and doing the slow
 * FFmpeg work when there is one. This is why encoding a video never
 * blocks anyone trying to use the API at the same time.
 */

const POLL_INTERVAL_MS = 5000; // how long to wait between polls when the queue is empty
interface Job{
    id: string;
    videoId: string;
    type: "TRANSCODE" | "THUMBNAIL" | "PREVIEW";
    
}

/**
 * Handles one TRANSCODE job end to end: run the encode, then translate
 * its output into database rows the rest of the app understands —
 * a MediaAsset row per manifest file, and a VideoVariant row per rung
 * (so "GET a video" can list its available quality levels). Wrapped in
 * try/catch so a bad video (corrupt file, unsupported codec) fails THIS
 * job only — it does not crash the worker or affect any other video.
 */

const processTransCodeJob = async (job: Job) => {
    try {
        const video = await prisma.video.findUnique({
            where: { id: job.videoId },
            include: { originalAsset: true },
        });

        if (!video || !video.originalAsset) {
            throw new Error(`Video or original asset not found for job ${job.id}`);
        }
        
        //the actual ffmpeg work is done in this service method, which returns the blob paths of the processed output
        const { masterBlobPath, variants } = await MediaProcessingService.transcode(video.originalAsset.blobPath);

        // Record the master manifest as a MediaAsset row, so it has an id
        // other parts of the app (like Video.hlsManifestAssetId) can point at.
        const manifestAsset = await prisma.mediaAsset.create({
            data: {
                type: "HLS_MASTER_MANIFEST",
                storageProvider: "AZURE_BLOB",
                container: "processed",
                blobPath: masterBlobPath,
                //mimeType: "application/vnd.apple.mpegurl",
                status: "READY",
            },
        });

        //one VideoVariant row per rung, so "GET a video" can list its available quality levels
        //list in the app would eventually query
        for (const variant of variants) { 
            const asset = await prisma.mediaAsset.create({
                data: {
                    type: "HLS_MASTER_MANIFEST",
                    storageProvider: "AZURE_BLOB",
                    container: "processed",
                    blobPath: variant.blobPath,
                    //mimeType: "application/vnd.apple.mpegurl",
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

        await prisma.video.update({
            where: { id: video.id },
            data: {
                hlsManifestAssetId: manifestAsset.id,
                status: "READY",
            },
        });

        await JobService.markSucceeded(job.id);
    } catch (error) {
      // Something failed — record why on the job row instead of crashing
      // the loop. markVideoReadyIfAllJobsDone() (below) will then notice
      // this job is FAILED and flip the video's own status accordingly.
      console.error(`Error processing job ${job.id}:`, error);
      await JobService.markFailed(
        job.id,
        error instanceof Error ? error.message : String(error),
      );
    }
};

/** Same pattern as processTransCodeJob, just for the single thumbnail generation */
const processThumbnailJob = async (job: Job) => {
    try {
        const video = await prisma.video.findUnique({
            where: { id: job.videoId },
            include: { originalAsset: true },
        });

        if (!video || !video.originalAsset) {
            throw new Error(`Video or original asset not found for job ${job.id}`);
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

        await prisma.video.update({
            where: { id: video.id },
            data: {
                thumbnailAssetId: thumbnailAsset.id,
            },
        });

        await JobService.markSucceeded(job.id);
    } catch (error) {
        console.error(`Error processing thumbnail job ${job.id}:`, error);
        await JobService.markFailed(
            job.id,
            error instanceof Error ? error.message : String(error),
        );
    }
};

/**
 * A video has TWO jobs (TRANSCODE + THUMBNAIL) that run independently and
 * finish at different times. After finishing either one, we check: are
 * BOTH done now? If yes, decide the video's final status — READY if
 * everything succeeded, FAILED if anything didn't. Until both are done,
 * we leave the video's status as PROCESSING (set back in completeUpload).
 */

const markVideoReadyIfAllJobsDone = async (videoId: string) => {
    const outstanding = await prisma.mediaProcessingJob.count({
        where: { videoId, status: { in: ["QUEUED", "RUNNING"] } },
    });
    const anyFailed = await prisma.mediaProcessingJob.count({
        where: { videoId, status: "FAILED" },
    });
    if (outstanding > 0) return; // still waiting for the other job to finish, or one already failed

    await prisma.video.update({
        where: { id: videoId },
        data: {
            status: anyFailed > 0 ? "FAILED" : "READY",
            publishedAt: anyFailed > 0 ? null : new Date(),
        },
    });
};

/**
 * One iteration of the poll loop: try to claim a job; if there's one,
 * dispatch it to the right handler by type, then re-check whether the
 * video it belongs to is fully done. If claimNextQueuedJob() returns
 * null, there's simply nothing to do this tick — we fall through to the
 * sleep in run() and check again later.
 */

const tick = async () => {
    try {
        const job = (await JobService.claimNextQueuedJob()) as Job | null;
        if (!job) return; // nothing to do this tick

        console.log(`Processing job ${job.id} (${job.type}) for video ${job.videoId}`);
        switch (job.type) {
            case "TRANSCODE":
                await processTransCodeJob(job);
                break;
            case "THUMBNAIL":
                await processThumbnailJob(job);
                break;
            default:
                console.error(`Unknown job type: ${job.type}`);
        }

        await markVideoReadyIfAllJobsDone(job.videoId);
    } catch (error) {
        // Belt-and-suspenders: even a bug in the bookkeeping above (not FFmpeg
        // itself) shouldn't kill the whole worker process — log it and keep polling.
        console.error("Error in tick:", error);
    }
};

/** The infinite poll loop. This is the only thing that runs when you start the worker. */
const run = async () => {
    console.log(`✓ Video processing worker started, polling every ${POLL_INTERVAL_MS}ms`);
    while (true) {
        await tick();
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
};

run().catch((err) => {
    console.error("Fatal error in worker:", err);
    process.exit(1);
});
