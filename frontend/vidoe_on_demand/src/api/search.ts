import type { CreatorResult } from '@/types/search';
import type { CategorySummary, VideoCardData, VideoPage } from '@/types/video';
import { toNumber } from '@/utils/normalize';
import { withQuery } from '@/utils/query';
import type { Api } from './client';
import { toCategory, toVideoCard } from './mappers';

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : null;

const toCreatorResult = (raw: Raw): CreatorResult => {
  const channelName = str(raw.channelName) ?? 'Creator';
  return {
    id: String(raw.creatorId ?? ''),
    channelName,
    name: str(raw.displayName) ?? channelName,
    username: str(raw.username),
    avatarUrl: str(raw.avatarUrl),
    followerCount: toNumber(raw.followerCount, 0),
  };
};

const PAGE = 20;

/** scope=all: first page of videos + up to 5 creators + matching categories, for the "All" tab. */
export const searchAll = async (
  api: Api,
  p: { q: string; signal?: AbortSignal },
) => {
  const data = await api.get<{
    videos?: Raw[];
    creators?: Raw[];
    categories?: Raw[];
    videosNextCursor?: string | null;
  }>(withQuery('/api/search', { q: p.q, scope: 'all', limit: PAGE }), {
    auth: 'none',
    signal: p.signal,
  });
  return {
    videos: (data.videos ?? []).map(toVideoCard) as VideoCardData[],
    hasMoreVideos: Boolean(data.videosNextCursor),
    creators: (data.creators ?? []).map(toCreatorResult),
    categories: (data.categories ?? []).map(toCategory) as CategorySummary[],
  };
};

export const searchVideos = async (
  api: Api,
  p: { q: string; cursor?: string; signal?: AbortSignal },
): Promise<VideoPage> => {
  const data = await api.get<{ videos?: Raw[]; nextCursor?: string | null }>(
    withQuery('/api/search', {
      q: p.q,
      scope: 'videos',
      limit: PAGE,
      cursor: p.cursor,
    }),
    { auth: 'none', signal: p.signal },
  );
  return {
    videos: (data.videos ?? []).map(toVideoCard),
    nextCursor: data.nextCursor ?? null,
  };
};

export const searchCreators = async (
  api: Api,
  p: { q: string; cursor?: string; signal?: AbortSignal },
) => {
  const data = await api.get<{ creators?: Raw[]; nextCursor?: string | null }>(
    withQuery('/api/search', {
      q: p.q,
      scope: 'creators',
      limit: PAGE,
      cursor: p.cursor,
    }),
    { auth: 'none', signal: p.signal },
  );
  return {
    creators: (data.creators ?? []).map(toCreatorResult),
    nextCursor: data.nextCursor ?? null,
  };
};

export const searchCategories = async (
  api: Api,
  p: { q: string; signal?: AbortSignal },
): Promise<CategorySummary[]> => {
  const data = await api.get<{ categories?: Raw[] }>(
    withQuery('/api/search', { q: p.q, scope: 'categories' }),
    { auth: 'none', signal: p.signal },
  );
  return (data.categories ?? []).map(toCategory);
};
