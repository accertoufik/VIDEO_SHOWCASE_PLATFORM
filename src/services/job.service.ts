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
  enqueueProcessingJobs: async (videoId: string) => {
    try {
      // Calling /complete twice on the same video (retries, double-clicks,
      // repeated Postman tests) shouldn't spawn a second set of jobs —
      // only enqueue a job type if one isn't already queued, running, or
      // already done for this video.
      const existing = await prisma.mediaProcessingJob.findMany({
        where: {
          videoId,
          status: { in: ['QUEUED', 'RUNNING', 'SUCCEEDED'] },
        },
        select: { type: true },
      });
      const existingTypes = new Set(existing.map((job) => job.type));

      const jobsToCreate = (['TRANSCODE', 'THUMBNAIL'] as const)
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

  claimNextQueuedJob: async () => {
    try {
      const job = await prisma.mediaProcessingJob.findFirst({
        where: { status: 'QUEUED' },
        orderBy: { startedAt: 'asc' }, //oldest job first fifo
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