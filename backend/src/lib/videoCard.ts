import { AzureStorageService } from "../services/azure-storage.service";

type Row = {
  thumbnailAsset?: { blobPath: string } | null;
  creator?: {
    id: string;
    channelName: string;
    user?: { profile?: { username: string; displayName: string; avatarAsset?: { blobPath: string } | null } | null } | null;
  } | null;
};

/**
 * Adds `thumbnailUrl` (signed) and `creatorInfo` to video rows, and drops the raw `creator` object
 * (it carried the whole user row). Signing failures degrade to null so one bad blob never fails a page.
 */
export const presentVideoCards = async <T extends Row>(rows: T[]) => {
  const paths = new Set<string>();
  for (const row of rows) {
    if (row.thumbnailAsset?.blobPath) paths.add(row.thumbnailAsset.blobPath);
    const avatar = row.creator?.user?.profile?.avatarAsset?.blobPath;
    if (avatar) paths.add(avatar);
  }

  const urls = new Map<string, string>();
  await Promise.all(
    [...paths].map(async (path) => {
      try {
        urls.set(path, await AzureStorageService.generateReadSasUrl("thumbnails", path, 60));
      } catch {
        // leave unset -> null -> the app shows a placeholder
      }
    })
  );
  const signed = (path?: string | null) => (path ? urls.get(path) ?? null : null);

  return rows.map(({ creator, ...row }) => {
    const profile = creator?.user?.profile;
    return {
      ...row,
      thumbnailUrl: signed(row.thumbnailAsset?.blobPath),
      creatorInfo: creator
        ? {
            id: creator.id,
            channelName: creator.channelName,
            username: profile?.username ?? null,
            displayName: profile?.displayName ?? null,
            avatarUrl: signed(profile?.avatarAsset?.blobPath),
          }
        : null,
    };
  });
};
