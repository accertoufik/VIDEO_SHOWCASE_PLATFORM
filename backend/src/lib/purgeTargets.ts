import { looksLikeVideoFolder, mediaBaseName } from './mediaPaths';

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


export const collectPurgeTargets = (videoId: string, assets: PurgeAsset[]): PurgeTargets => {
  const blobs = new Map<string, { container: string; path: string }>();
  const prefixes = new Map<string, { container: string; prefix: string }>();

  for (const a of assets) {
    if (!a.blobPath || a.blobPath.startsWith('/') || a.blobPath.includes('..')) continue;
    blobs.set(`${a.container}/${a.blobPath}`, { container: a.container, path: a.blobPath });

    // The ORIGINAL upload names the video's processed folder, even before any processed file is recorded in the
    // database (a video that is still encoding has uploaded files but no rows for them yet).
    if (a.container === 'originals' && a.blobPath.includes('/')) {
      const folder = mediaBaseName(a.blobPath);
      if (looksLikeVideoFolder(folder)) {
        prefixes.set(`processed/${folder}/`, { container: 'processed', prefix: `${folder}/` });
        prefixes.set(`thumbnails/${folder}/`, { container: 'thumbnails', prefix: `${folder}/` });
      }
    }

    if (a.container === 'processed') {
      const folder = a.blobPath.split('/')[0] ?? '';
      if (looksLikeVideoFolder(folder) && a.blobPath.includes('/')) {
        prefixes.set(`processed/${folder}/`, { container: 'processed', prefix: `${folder}/` });
        // The worker's auto-generated thumbnail lives in the thumbnails container under the same folder name.
        prefixes.set(`thumbnails/${folder}/`, { container: 'thumbnails', prefix: `${folder}/` });
      }
    }
  }

  // Custom thumbnails are saved as thumbnails/<videoId>/<random>.<ext>, including ones since replaced.
  if (videoId.length >= 36) prefixes.set(`thumbnails/thumbnails/${videoId}/`, { container: 'thumbnails', prefix: `thumbnails/${videoId}/` });

  return { blobs: [...blobs.values()], prefixes: [...prefixes.values()] };
};
