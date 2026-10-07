import * as FileSystem from 'expo-file-system/legacy';
import type { PublicProfile } from '@/types/publicProfile';
import type { VideoCardData } from '@/types/video';
import { isApiError } from './ApiError';
import type { Api } from './client';
import { toVideoCard } from './mappers';

const required = { auth: 'required' } as const;

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : null;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export const getPublicProfile = async (
  api: Api,
  username: string,
  signal?: AbortSignal,
): Promise<PublicProfile> => {
  // Optional auth: a token only adds the viewer block (am I following / is this my channel).
  const d = await api.get<Raw>(`/api/users/${encodeURIComponent(username)}`, {
    auth: 'optional',
    signal,
  });
  const p = (d.profile ?? {}) as Raw;
  const c = p.creator as Raw | null | undefined;
  const v = d.viewer as Raw | null | undefined;

  return {
    displayName: str(p.displayName) ?? username,
    username: str(p.username) ?? username,
    biography: str(p.biography),
    avatarUrl: str(p.avatarUrl),
    creator: c
      ? {
          id: String(c.id),
          channelName: str(c.channelName) ?? '',
          aboutText: str(c.aboutText),
          bannerUrl: str(c.bannerUrl),
          verified: c.verificationStatus === 'VERIFIED',
        }
      : null,
    followerCount: num(d.followerCount),
    viewer: v
      ? {
          isFollowing: Boolean(v.isFollowing),
          isOwnChannel: Boolean(v.isOwnChannel),
        }
      : null,
  };
};

export type CreatorVideoType = 'LONG_FORM' | 'SHORT_FORM';

export const getCreatorVideos = async (
  api: Api,
  creatorId: string,
  opts: { type: CreatorVideoType; cursor?: string; signal?: AbortSignal },
) => {
  const params = new URLSearchParams({ limit: '20', type: opts.type });
  if (opts.cursor) params.set('cursor', opts.cursor);
  const d = await api.get<{ videos?: Raw[]; nextCursor?: string | null }>(
    `/api/creators/${creatorId}/videos?${params}`,
    { auth: 'none', signal: opts.signal },
  );
  return {
    items: (d.videos ?? []).map<VideoCardData>(toVideoCard),
    nextCursor: d.nextCursor ?? null,
  };
};

/** Already following (409) counts as success. */
export const followCreator = async (api: Api, creatorId: string) => {
  try {
    await api.post(`/api/creators/${creatorId}/follow`, undefined, required);
  } catch (error) {
    if (!(isApiError(error) && error.status === 409)) throw error;
  }
};

/** Not following (404/409) counts as success. */
export const unfollowCreator = async (api: Api, creatorId: string) => {
  try {
    await api.del(`/api/creators/${creatorId}/follow`, undefined, required);
  } catch (error) {
    if (!(isApiError(error) && (error.status === 404 || error.status === 409)))
      throw error;
  }
};

/** displayName 1-80 chars, username (handle) 3-30 of a-z 0-9 _, biography up to 500. Send only what changed. */
export const updateProfile = (
  api: Api,
  changes: { displayName?: string; username?: string; biography?: string },
) => api.patch('/api/profile', changes, required);

/** 3 steps: ask the API for a signed upload url, upload the file straight to blob storage, then confirm. */
export const uploadAvatar = async (
  api: Api,
  file: { uri: string; mimeType?: string | null },
) => {
  const mime = file.mimeType ?? 'image/jpeg';
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';

  // The avatar route wants a leading dot (the banner route does not).
  const { uploadUrl, blobName } = await api.post<{
    uploadUrl: string;
    blobName: string;
  }>('/api/profile/avatar', { fileExtension: `.${ext}` }, required);

  // Stream the picked file from disk. fetch(file://).blob() can silently return an error body ("File not found")
  // that then gets uploaded as if it were the photo.
  const result = await FileSystem.uploadAsync(uploadUrl, file.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': mime },
  });
  if (result.status < 200 || result.status >= 300)
    throw new Error('Could not upload your photo. Try again.');

  await api.post('/api/profile/avatar/confirm', { blobName }, required);
};

/** Clears history and resume points. */
export const clearWatchHistory = (api: Api) =>
  api.del('/api/me/history', undefined, required);

/** Permanently deletes the signed-in user's own account (and, for a creator, their channel and videos). */
export const deleteMyAccount = (api: Api) =>
  api.del('/api/me', undefined, required);


export type UsernameCheck = { available: boolean; reason: 'invalid' | 'taken' | null };

/** Live "is this username free?" check (case-insensitive; your own current name counts as free). */
export const checkUsername = async (api: Api, username: string, signal?: AbortSignal): Promise<UsernameCheck> => {
  const d = await api.get<Raw>(`/api/username-available?username=${encodeURIComponent(username)}`, {
    auth: 'optional',
    signal,
  });
  return {
    available: d.available === true,
    reason: d.reason === 'taken' ? 'taken' : d.reason === 'invalid' ? 'invalid' : null,
  };
};
