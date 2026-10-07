import type { CreatorResult } from '@/types/search';
import type { LibraryPage, LibraryVideo } from '@/types/library';
import type { PlaybackProgress } from '@/types/video';
import { toNumber } from '@/utils/normalize';
import { withQuery } from '@/utils/query';
import type { Api } from './client';
import { toVideoCard } from './mappers';

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : null;
const required = { auth: 'required' } as const;

type PageParams = { cursor?: string; limit: number; signal?: AbortSignal };

const toProgress = (raw: unknown): PlaybackProgress | null => {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Raw;
  return {
    positionMs: toNumber(p.positionMs, 0),
    completionPercent: toNumber(p.completionPercent, 0),
    completed: Boolean(p.completed),
  };
};

const toLibraryVideo = (
  key: unknown,
  video: unknown,
  progress?: unknown,
): LibraryVideo => ({
  key: String(key ?? ''),
  video: toVideoCard(video as Raw),
  progress: toProgress(progress),
});

const fetchPage = <T>(
  api: Api,
  path: string,
  p: PageParams,
  pick: (data: Raw) => { items: T[]; nextCursor: unknown },
) =>
  api
    .get<Raw>(withQuery(path, { limit: p.limit, cursor: p.cursor }), {
      ...required,
      signal: p.signal,
    })
    .then((data): LibraryPage<T> => {
      const { items, nextCursor } = pick(data);
      return { items, nextCursor: str(nextCursor) };
    });

const list = (v: unknown) => (Array.isArray(v) ? (v as Raw[]) : []);

export const getHistory = (api: Api, p: PageParams) =>
  fetchPage(api, '/api/me/history', p, (d) => ({
    items: list(d.items).map((r) =>
      toLibraryVideo(r.historyId, r.video, r.progress),
    ),
    nextCursor: d.nextCursor,
  }));

export const getContinueWatching = (api: Api, p: PageParams) =>
  fetchPage(api, '/api/me/continue-watching', p, (d) => ({
    items: list(d.items).map((r) =>
      toLibraryVideo(r.progressId, r.video, r.progress),
    ),
    nextCursor: d.nextCursor,
  }));

export const getLikedVideos = (api: Api, p: PageParams) =>
  fetchPage(api, '/api/videos/liked/mine', p, (d) => ({
    items: list(d.liked).map((r) => toLibraryVideo(r.id, r.video)),
    nextCursor: d.nextCursor,
  }));

export const getSavedVideos = (api: Api, p: PageParams) =>
  fetchPage(api, '/api/videos/saved/mine', p, (d) => ({
    items: list(d.saved).map((r) => toLibraryVideo(r.id, r.video)),
    nextCursor: d.nextCursor,
  }));

export const getFollowing = (api: Api, p: PageParams) =>
  fetchPage<CreatorResult>(api, '/api/me/following', p, (d) => ({
    items: list(d.creators).map((c) => {
      const channelName = str(c.channelName) ?? 'Creator';
      return {
        id: String(c.creatorId ?? ''),
        channelName,
        name: str(c.displayName) ?? channelName,
        username: str(c.username),
        followerCount: toNumber(c.followerCount, 0),
        avatarUrl: str(c.avatarUrl),
      };
    }),
    nextCursor: d.nextCursor,
  }));

export const removeFromHistory = (api: Api, videoId: string) =>
  api.del(`/api/me/history/${videoId}`, undefined, required);
export const clearHistory = (api: Api) => api.del('/api/me/history', undefined, required);
