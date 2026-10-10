import { containers, type ContainerName } from '../config/azure';
import { prisma } from '../config/db';
import { collectPurgeTargets, type PurgeTargets } from '../lib/purgeTargets';

/**
 * Deleting a video deletes it FOR GOOD: no soft delete, no grace period.
 *
 *  1. Everything that hangs off the video goes with its row (the schema cascades likes, comments and their likes,
 *     saves, watch-later, history, watch progress, tags, versions and encode jobs). Notifications only lose their
 *     link on cascade, so they are deleted explicitly: a "someone liked your video" for a video that no longer
 *     exists would be a dead end.
 *  2. The database rows go first, in one transaction, so the video vanishes from the feed, the channel page, the
 *     studio and every list at the same moment. The worker, which polls the database, notices the video is gone and
 *     stops encoding it (see the worker's job watcher).
 *  3. The stored files (original upload, every HLS chunk, thumbnails, subtitles, extra audio) are removed afterwards,
 *     in the background for a user's request so tapping Delete never waits for thousands of files.
 */
const assetSelect = { id: true, container: true, blobPath: true } as const;
const isContainer = (name: string): name is ContainerName => name in containers;

const PARALLEL = 16;
const ATTEMPTS = 3;

const retry = async (fn: () => Promise<unknown>) => {
  for (let attempt = 1; ; attempt++) {
    try {
      await fn();
      return true;
    } catch (error) {
      if (attempt >= ATTEMPTS) return false;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
};

/** Removes the files named by `targets` from storage. Never throws; failures are counted and logged. */
export const deleteStorageTargets = async (targets: PurgeTargets) => {
  let removed = 0;
  let failed = 0;
  const removeOne = async (container: ContainerName, name: string) => {
    const ok = await retry(() => containers[container].getBlockBlobClient(name).deleteIfExists());
    if (ok) removed += 1;
    else failed += 1;
  };

  for (const blob of targets.blobs) {
    if (isContainer(blob.container)) await removeOne(blob.container, blob.path);
  }
  for (const prefix of targets.prefixes) {
    if (!isContainer(prefix.container)) continue;
    const names: string[] = [];
    try {
      for await (const item of containers[prefix.container].listBlobsFlat({ prefix: prefix.prefix })) names.push(item.name);
    } catch (error) {
      failed += 1;
      console.error(`[delete] could not list ${prefix.container}/${prefix.prefix}:`, error instanceof Error ? error.message : error);
      continue;
    }
    for (let i = 0; i < names.length; i += PARALLEL) {
      await Promise.all(names.slice(i, i + PARALLEL).map((name) => removeOne(prefix.container as ContainerName, name)));
    }
  }
  return { removed, failed };
};

export const VideoDeleteService = {
  /**
   * Permanently deletes one video (no ownership check: callers do that). Returns false if it does not exist.
   * `background: true` returns as soon as the database is clean and deletes the files afterwards.
   */
  hardDelete: async (videoId: string, options: { background?: boolean } = {}): Promise<boolean> => {
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      select: {
        id: true,
        originalAsset: { select: assetSelect },
        thumbnailAsset: { select: assetSelect },
        previewAsset: { select: assetSelect },
        hlsManifestAsset: { select: assetSelect },
        variants: { select: { asset: { select: assetSelect } } },
      },
    });
    if (!video) return false;

    const assets = [video.originalAsset, video.thumbnailAsset, video.previewAsset, video.hlsManifestAsset, ...video.variants.map((v) => v.asset)].filter(
      (a): a is NonNullable<typeof a> => a !== null,
    );
    // Work out which files to remove BEFORE the rows that name them are gone.
    const targets = collectPurgeTargets(video.id, assets);

    await prisma.$transaction([
      prisma.notification.deleteMany({ where: { videoId } }),
      prisma.video.delete({ where: { id: videoId } }),
      prisma.mediaAsset.deleteMany({ where: { id: { in: assets.map((a) => a.id) } } }),
    ]);

    const removeFiles = async () => {
      const { removed, failed } = await deleteStorageTargets(targets);
      console.log(`[delete] video ${videoId}: removed ${removed} stored file(s)${failed ? `, ${failed} could not be removed` : ''}`);
    };
    if (options.background) void removeFiles().catch((error) => console.error('[delete] file cleanup failed:', error));
    else await removeFiles();
    return true;
  },
};
