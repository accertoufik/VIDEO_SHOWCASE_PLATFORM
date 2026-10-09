import { containers, type ContainerName } from '../config/azure';
import { prisma } from '../config/db';
import { collectPurgeTargets, type PurgeAsset } from '../lib/purgeTargets';

/**
 * Reclaims storage from videos their owner deleted. Deleting in the app is a SOFT delete (the video is hidden and
 * recoverable); this job removes the files for good once the grace period has passed.
 *
 * Runs inside the API process: shortly after start, then every PURGE_INTERVAL_HOURS. Safe to repeat or to run from
 * two replicas at once (deleting a missing file is a no-op). A video counts as purged when its original asset is
 * marked DELETED; if anything fails, nothing is marked and the next run tries again.
 *
 * Env: PURGE_ENABLED (default on in production, off elsewhere), PURGE_AFTER_DAYS (default 30),
 *      PURGE_INTERVAL_HOURS (default 6), PURGE_BATCH (videos per run, default 10),
 *      PURGE_DRY_RUN=true to only log what would be removed.
 */
const config = () => ({
  enabled: (process.env.PURGE_ENABLED ?? (process.env.NODE_ENV === 'production' ? 'true' : 'false')) === 'true',
  afterMs: Math.max(1, Number(process.env.PURGE_AFTER_DAYS ?? 30)) * 86_400_000,
  everyMs: Math.max(1, Number(process.env.PURGE_INTERVAL_HOURS ?? 6)) * 3_600_000,
  batch: Math.max(1, Number(process.env.PURGE_BATCH ?? 10)),
  dryRun: process.env.PURGE_DRY_RUN === 'true',
});

const isContainer = (name: string): name is ContainerName => name in containers;

const assetSelect = { id: true, container: true, blobPath: true } as const;

const deleteInBatches = async (names: string[], remove: (name: string) => Promise<unknown>) => {
  for (let i = 0; i < names.length; i += 16) await Promise.all(names.slice(i, i + 16).map(remove));
};

const purgeVideo = async (video: {
  id: string;
  originalAsset: { id: string; container: string; blobPath: string } | null;
  thumbnailAsset: { id: string; container: string; blobPath: string } | null;
  previewAsset: { id: string; container: string; blobPath: string } | null;
  hlsManifestAsset: { id: string; container: string; blobPath: string } | null;
  variants: Array<{ asset: { id: string; container: string; blobPath: string } }>;
}) => {
  const assets = [
    video.originalAsset,
    video.thumbnailAsset,
    video.previewAsset,
    video.hlsManifestAsset,
    ...video.variants.map((v) => v.asset),
  ].filter((a): a is NonNullable<typeof a> => a !== null);

  const targets = collectPurgeTargets(video.id, assets satisfies PurgeAsset[]);
  if (config().dryRun) {
    console.log(`[purge] DRY RUN video ${video.id}: would remove ${targets.blobs.length} file(s) and ${targets.prefixes.map((p) => `${p.container}/${p.prefix}*`).join(', ')}`);
    return 0;
  }
  let files = 0;

  for (const b of targets.blobs) {
    if (!isContainer(b.container)) continue;
    await containers[b.container].getBlockBlobClient(b.path).deleteIfExists();
    files += 1;
  }
  for (const p of targets.prefixes) {
    if (!isContainer(p.container)) continue;
    const container = containers[p.container];
    const names: string[] = [];
    for await (const blob of container.listBlobsFlat({ prefix: p.prefix })) names.push(blob.name);
    await deleteInBatches(names, (name) => container.getBlockBlobClient(name).deleteIfExists());
    files += names.length;
  }

  await prisma.mediaAsset.updateMany({ where: { id: { in: assets.map((a) => a.id) } }, data: { status: 'DELETED' } });
  return files;
};

let running = false;

export const purgeDeletedVideos = async () => {
  if (running) return;
  running = true;
  try {
    const c = config();
    const videos = await prisma.video.findMany({
      where: {
        deletedAt: { lte: new Date(Date.now() - c.afterMs) },
        originalAsset: { is: { status: { not: 'DELETED' } } },
      },
      orderBy: { deletedAt: 'asc' },
      take: c.batch,
      select: {
        id: true,
        originalAsset: { select: assetSelect },
        thumbnailAsset: { select: assetSelect },
        previewAsset: { select: assetSelect },
        hlsManifestAsset: { select: assetSelect },
        variants: { select: { asset: { select: assetSelect } } },
      },
    });
    for (const video of videos) {
      try {
        const files = await purgeVideo(video);
        console.log(`[purge] video ${video.id}: removed ${files} stored file(s)`);
      } catch (error) {
        console.error(`[purge] video ${video.id} failed, will retry:`, error instanceof Error ? error.message : error);
      }
    }
  } catch (error) {
    console.error('[purge] run failed:', error instanceof Error ? error.message : error);
  } finally {
    running = false;
  }
};

export const startPurgeJob = () => {
  const c = config();
  if (!c.enabled) return;
  console.log(`[purge] deleted videos are removed from storage ${c.afterMs / 86_400_000} days after deletion (checked every ${c.everyMs / 3_600_000} h)`);
  setInterval(() => void purgeDeletedVideos(), c.everyMs).unref();
  setTimeout(() => void purgeDeletedVideos(), 2 * 60_000).unref();
};
