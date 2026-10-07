import type { VideoPage } from '@/types/video';
import { withQuery } from '@/utils/query';
import type { Api } from './client';
import { toVideoCard } from './mappers';

type RawPage = {
  videos?: Array<Record<string, unknown>>;
  nextCursor?: string | null;
};

/** Long-form home feed. `q=home` is the documented workaround; the backend ignores it. */
export const getFeed = async (
  api: Api,
  params: {
    cursor?: string;
    categoryId?: string;
    limit?: number;
    signal?: AbortSignal;
  },
): Promise<VideoPage> => {
  const path = withQuery('/api/feed', {
    q: 'home',
    limit: params.limit ?? 20,
    cursor: params.cursor,
    categoryId: params.categoryId,
  });
  const data = await api.get<RawPage>(path, {
    auth: 'none',
    signal: params.signal,
  });
  return {
    videos: (data.videos ?? []).map(toVideoCard),
    nextCursor: data.nextCursor ?? null,
  };
};
