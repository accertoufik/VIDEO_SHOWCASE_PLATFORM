import { randomUUID } from "node:crypto";
import { prisma } from "../config/db";


/**
 * JobService is our "job queue" — but instead of a separate piece of
 * infrastructure like Redis + BullMQ, it's just rows in the
 * media_processing_jobs table (already in your Prisma schema). Two
 * processes cooperate through this one table:
 *   - the API server INSERTS rows (a job to do) — see enqueueProcessingJobs
 *   - the worker (video-processor.worker.ts) READS and UPDATES rows,
 *     in a loop, forever — see claimNextQueuedJob / markSucceeded / markFailed
 * Neither process talks to the other directly. The database is the queue.
 */

export const JobService = {
  /**
   * Only TRANSCODE_STANDARD + THUMBNAIL are enqueued here. TRANSCODE_1080P
   * / TRANSCODE_1440P are deliberately NOT created yet — nobody has probed
   * the source's resolution at this point, so we don't yet know which (if
   * any) HD rungs it actually qualifies for. Creating both HD job rows
   * upfront and hoping to "skip" the wrong one later has a real race: with
   * WORKER_CONCURRENCY claiming several jobs per tick, an HD job can be
   * claimed and start running in the SAME tick as TRANSCODE_STANDARD,
   * before STANDARD has had a chance to determine resolution — so the
   * skip never gets a chance to fire, and the HD job re-downloads the
   * source and runs ffprobe just to discover it doesn't qualify. See
   * enqueueHdJobsIfNeeded() below, called by the worker only AFTER
   * TRANSCODE_STANDARD already knows the answer.
   */
  enqueueProcessingJobs: async (videoId: string) => {
    try {
      const existing = await prisma.mediaProcessingJob.findMany({
        where: {
          videoId,
          status: { in: ['QUEUED', 'RUNNING', 'SUCCEEDED'] },
        },
        select: { type: true },
      });
      const existingTypes = new Set(existing.map((job) => job.type));

      const jobsToCreate = (['TRANSCODE_STANDARD', 'THUMBNAIL'] as const)
        .filter((type) => !existingTypes.has(type))
        .map((type) => ({
          videoId,
          type,
          idempotencyKey: `${videoId}-${type}-${randomUUID()}`,
        }));

      if (jobsToCreate.length === 0) {
        return;
      }

      await prisma.mediaProcessingJob.createMany({ data: jobsToCreate });
    } catch (error) {
      throw new Error(
        `Failed to enqueue processing jobs for videoId ${videoId}: ${error}`,
      );
    }
  },

  /**
   * Called by the worker's TRANSCODE_STANDARD handler, once it actually
   * knows which HD rungs (if any) the source qualifies for. Only creates
   * job rows for labels that qualify — a 1080p source gets exactly one
   * TRANSCODE_1080P row and no TRANSCODE_1440P row at all, so there's
   * nothing left for a 1440p job to wastefully claim and bail on.
   */
  enqueueHdJobsIfNeeded: async (videoId: string, hdRungsNeeded: string[]) => {
    try {
      const typeByLabel = { '1080p': 'TRANSCODE_1080P', '1440p': 'TRANSCODE_1440P' } as const;
      const typesToCreate = hdRungsNeeded
        .filter((label): label is '1080p' | '1440p' => label === '1080p' || label === '1440p')
        .map((label) => typeByLabel[label]);

      if (typesToCreate.length === 0) return;

      const existing = await prisma.mediaProcessingJob.findMany({
        where: {
          videoId,
          type: { in: typesToCreate },
          status: { in: ['QUEUED', 'RUNNING', 'SUCCEEDED'] },
        },
        select: { type: true },
      });
      const existingTypes = new Set(existing.map((job) => job.type));

      const jobsToCreate = typesToCreate
        .filter((type) => !existingTypes.has(type))
        .map((type) => ({
          videoId,
          type,
          idempotencyKey: `${videoId}-${type}-${randomUUID()}`,
        }));

      if (jobsToCreate.length === 0) return;

      await prisma.mediaProcessingJob.createMany({ data: jobsToCreate });
    } catch (error) {
      throw new Error(
        `Failed to enqueue HD jobs for videoId ${videoId}: ${error}`,
      );
    }
  },

  /**
   * The worker calls this in its poll loop, asking "is there anything to
   * do?" This is the trickiest part of a DB-backed queue: if you ever run
   * more than one worker process, two of them could both SELECT the same
   * QUEUED job at the same instant and both start encoding it — wasted
   * work at best, corrupted data at worst.
   *
   * The fix is "claim, don't just read": after finding a candidate job, we
   * run an UPDATE with a WHERE clause that requires status is STILL
   * "QUEUED". Only one worker's UPDATE can match that row — Postgres
   * guarantees that. Whichever worker's updateMany() reports count: 1 won
   * the race and now owns the job; the other gets count: 0 and returns
   * null, so it just tries again on its next poll tick instead of double-
   * processing.
   */

  /**
   * A worker that crashes (or is redeployed) mid-encode leaves its job RUNNING forever, and nothing else
   * would ever pick it up. Called from the worker's tick: jobs RUNNING longer than `olderThanMs` go back
   * to QUEUED, up to MAX_RETRIES times; after that they are marked FAILED so a bad file can't loop forever.
   */
  requeueStaleJobs: async (olderThanMs: number, maxRetries = 2) => {
    const cutoff = new Date(Date.now() - olderThanMs);
    const requeued = await prisma.mediaProcessingJob.updateMany({
      where: { status: 'RUNNING', startedAt: { lt: cutoff }, retryCount: { lt: maxRetries } },
      data: { status: 'QUEUED', startedAt: null, retryCount: { increment: 1 } },
    });
    const failed = await prisma.mediaProcessingJob.updateMany({
      where: { status: 'RUNNING', startedAt: { lt: cutoff }, retryCount: { gte: maxRetries } },
      data: { status: 'FAILED', completedAt: new Date(), errorMessage: 'Timed out (worker stopped?)' },
    });
    return { requeued: requeued.count, failed: failed.count };
  },

  claimNextQueuedJob: async () => {
    try {
      const job = await prisma.mediaProcessingJob.findFirst({
        where: { status: 'QUEUED' },
        orderBy: { queuedAt: 'asc' }, // oldest job first (FIFO). startedAt is NULL while queued, so it can't order the queue
      });
      if (!job) {
        return null;
      }
      const claimedJob = await prisma.mediaProcessingJob.updateMany({
        where: { id: job.id, status: 'QUEUED' },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
      if (claimedJob.count === 0) {
        // Another worker claimed it first; try again next tick
        return null;
      }
      return prisma.mediaProcessingJob.findUnique({ where: { id: job.id } });
    } catch (error) {
      throw new Error(`Failed to claim next queued job: ${error}`);
    }
  },

  /** called once ffmpeg finishes without error - records when it finished */
  markSucceeded: async (jobId: string) => {
    try {
      await prisma.mediaProcessingJob.update({
        where: { id: jobId },
        data: { status: 'SUCCEEDED', completedAt: new Date() },
      });
    } catch (error) {
      throw new Error(`Failed to mark job ${jobId} as succeeded: ${error}`);
    }
  },

  /**
   * Called when anything in the pipeline throws — bad file, FFmpeg crash,
   * Azure upload failure, whatever. We record the error message on the
   * row itself, so you can see *why* a video failed just by querying the
   * table, rather than having to dig through worker logs.
   */

  markFailed: async (jobId: string, errorMessage: string) => {
    try {
      await prisma.mediaProcessingJob.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          errorMessage,
        },
      });
    } catch (error) {
      throw new Error(`Failed to mark job ${jobId} as failed: ${error}`);
    }
  }
};