/**
 * Works out which storage files belong to ONE deleted video, from that video's own asset records. Pure (no I/O) so it
 * can be tested. Nothing outside the video's own records is ever selected.
 */
export type PurgeAsset = { container: string; blobPath: string };

export type PurgeTargets = {
  /** Single files, named exactly in the asset records. */
  blobs: Array<{ container: string; path: string }>;
  /** Everything under a folder-like prefix: the HLS segments and playlists, and replaced custom thumbnails. */
  prefixes: Array<{ container: string; prefix: string }>;
};

// The folder a video's processed files live in is "<creator>-<upload id>-<ext>" (a UUID pair): always long. This
// refuses anything short or empty, so a malformed record can never turn into "delete everything".
const looksLikeVideoFolder = (name: string) => name.length >= 36 && name.includes('-') && !name.includes('..');

export const collectPurgeTargets = (videoId: string, assets: PurgeAsset[]): PurgeTargets => {
  const blobs = new Map<string, { container: string; path: string }>();
  const prefixes = new Map<string, { container: string; prefix: string }>();

  for (const a of assets) {
    if (!a.blobPath || a.blobPath.startsWith('/') || a.blobPath.includes('..')) continue;
    blobs.set(`${a.container}/${a.blobPath}`, { container: a.container, path: a.blobPath });

    if (a.container === 'processed') {
      const folder = a.blobPath.split('/')[0] ?? '';
      if (looksLikeVideoFolder(folder) && a.blobPath.includes('/')) {
        prefixes.set(`processed/${folder}/`, { container: 'processed', prefix: `${folder}/` });
      }
    }
  }

  // Custom thumbnails are saved as thumbnails/<videoId>/<random>.<ext>, including ones since replaced.
  if (videoId.length >= 36) prefixes.set(`thumbnails/thumbnails/${videoId}/`, { container: 'thumbnails', prefix: `thumbnails/${videoId}/` });

  return { blobs: [...blobs.values()], prefixes: [...prefixes.values()] };
};
