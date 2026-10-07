import type { VideoPage } from '@/types/video';
import { withQuery } from '@/utils/query';
import { toNumber } from '@/utils/normalize';
import type { Api } from './client';
import { toVideoCard } from './mappers';

export type CreatorPage = {
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  biography: string | null;
  /** Null when this person has a profile but isn't a creator (no channel). */
  creator: { id: string; channelName: string; aboutText: string | null } | null;
  followerCount: number;
  isFollowing: boolean;
  isOwnChannel: boolean;
};

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

export const getCreatorPage = async (
  api: Api,
  username: string,
  signal?: AbortSignal,
): Promise<CreatorPage> => {
  const data = await api.get<Raw>(`/api/users/${encodeURIComponent(username)}`, {
    auth: 'optional',
    signal,
  });
  const profile = (data.profile ?? {}) as Raw;
  // Current API: the channel is nested at profile.creator. Older builds sent it as data.creator or under profile.user.
  const creator = (profile.creator ??
    data.creator ??
    (profile.user as Raw | undefined)?.creatorProfile) as Raw | null | undefined;
  const viewer = data.viewer as { isFollowing?: boolean; isOwnChannel?: boolean } | null;

  return {
    username: str(profile.username) ?? username,
    displayName: str(profile.displayName) ?? username,
    avatarUrl: str(profile.avatarUrl),
    bannerUrl: str(creator?.bannerUrl),
    biography: str(profile.biography),
    creator: creator
      ? {
          id: String(creator.id ?? ''),
          channelName: str(creator.channelName) ?? '',
          aboutText: str(creator.aboutText),
        }
      : null,
    followerCount: toNumber(data.followerCount, 0),
    isFollowing: viewer?.isFollowing === true,
    isOwnChannel: viewer?.isOwnChannel === true,
  };
};

export const getCreatorVideos = async (
  api: Api,
  creatorId: string,
  params: { cursor?: string; type?: 'LONG_FORM' | 'SHORT_FORM'; signal?: AbortSignal },
): Promise<VideoPage> => {
  const data = await api.get<{
    videos?: Array<Record<string, unknown>>;
    nextCursor?: string | null;
  }>(withQuery(`/api/creators/${creatorId}/videos`, {
    limit: 20,
    cursor: params.cursor,
    type: params.type,
  }), {
    auth: 'none',
    signal: params.signal,
  });
  return {
    videos: (data.videos ?? []).map(toVideoCard),
    nextCursor: data.nextCursor ?? null,
  };
};

export const followCreator = (api: Api, creatorId: string) =>
  api.post(`/api/creators/${creatorId}/follow`, undefined, { auth: 'required' });

export const unfollowCreator = (api: Api, creatorId: string) =>
  api.del(`/api/creators/${creatorId}/follow`, undefined, { auth: 'required' });


// ---- Channel setup (Become a creator / Edit channel) ----
const required = { auth: 'required' } as const;

/** Where to PUT an image file, and the name to confirm afterwards. */
export type UploadTicket = { uploadUrl: string; blobName: string };

export const becomeCreator = (
  api: Api,
  body: { channelName?: string; aboutText?: string },
) => api.post('/api/creator-profile', body, required);

export const updateAbout = (api: Api, aboutText: string) =>
  api.patch('/api/creator-profile/about', { aboutText }, required);

// Banner extensions are sent WITHOUT the dot (the avatar route wants one; see uploadAvatar in api/profile.ts).
export const requestBannerUpload = (api: Api, fileExtension: string) =>
  api.post<UploadTicket>('/api/creator-profile/banner', { fileExtension }, required);

export const confirmBanner = (api: Api, blobName: string) =>
  api.post('/api/creator-profile/banner/confirm', { blobName }, required);
