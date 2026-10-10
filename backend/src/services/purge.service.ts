import { prisma } from '../config/db';
import { VideoDeleteService } from './video-delete.service';

/**
 * A safety net, not the normal delete path. Deleting a video is permanent and immediate (VideoDeleteService), so this
 * only sweeps up leftovers:
 *   - videos that are only HIDDEN (deletedAt set): ones deleted by older versions of the app, and a creator's videos
 *     when their account is deleted. They are removed for good, with their files, within one sweep.
 *   - uploads that never finished (still UPLOADING after PURGE_ABANDONED_HOURS): abandoned, with a half-uploaded file
 *     in storage and an empty row in the database.
 *
 * Runs inside the API process: shortly after start, then every PURGE_INTERVAL_MINUTES. Safe to repeat or to run from
 * two replicas at once (deleting something already gone is a no-op).
 *
 * Env: PURGE_ENABLED (default on in production, off elsewhere), PURGE_INTERVAL_MINUTES (default 10),
 *      PURGE_BATCH (videos per sweep, default 20), PURGE_ABANDONED_HOURS (default 24).
 */
const config = () => ({
  enabled: (process.env.PURGE_ENABLED ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true',
  everyMs: Math.max(1, Number(process.env.PURGE_INTERVAL_MINUTES ?? 10)) * 60_000,
  batch: Math.max(1, Number(process.env.PURGE_BATCH ?? 20)),
  abandonedMs: Math.max(1, Number(process.env.PURGE_ABANDONED_HOURS ?? 24)) * 3_600_000,
});

let running = false;

export const purgeDeletedVideos = async () => {
  if (running) return;
  running = true;
  try {
    const c = config();
    const leftovers = await prisma.video.findMany({
      where: {
        OR: [{ deletedAt: { not: null } }, { status: 'UPLOADING', createdAt: { lt: new Date(Date.now() - c.abandonedMs) } }],
      },
      orderBy: { createdAt: 'asc' },
      take: c.batch,
      select: { id: true },
    });
    for (const { id } of leftovers) {
      try {
        // Waits for the files too, so a sweep that is interrupted is simply repeated by the next one.
        await VideoDeleteService.hardDelete(id);
        console.log(`[purge] removed leftover video ${id}`);
      } catch (error) {
        console.error(`[purge] video ${id} failed, will retry:`, error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    console.error('[purge] sweep failed:', error instanceof Error ? error.message : error);
  } finally {
    running = false;
  }
};

export const startPurgeJob = () => {
  const c = config();
  if (!c.enabled) return;
  console.log(`[purge] sweeping hidden and abandoned videos every ${c.everyMs / 60_000} min`);
  setInterval(() => void purgeDeletedVideos(), c.everyMs).unref();
  setTimeout(() => void purgeDeletedVideos(), 30_000).unref();
};
