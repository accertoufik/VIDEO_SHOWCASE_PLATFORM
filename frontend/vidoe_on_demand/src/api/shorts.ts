import type { VideoPage } from '@/types/video';
import { withQuery } from '@/utils/query';
import type { Api } from './client';
import { toVideoCard } from './mappers';

type RawPage = {
  videos?: Array<Record<string, unknown>>;
  nextCursor?: string | null;
};

export const getShorts = async (
  api: Api,
  p: {
    cursor?: string;
    categoryId?: string;
    limit?: number;
    signal?: AbortSignal;
  },
): Promise<VideoPage> => {
  const data = await api.get<RawPage>(
    withQuery('/api/shorts', {
      limit: p.limit ?? 10,
      cursor: p.cursor,
      categoryId: p.categoryId,
    }),
    {
      auth: 'none',
      signal: p.signal,
    },
  );
  return {
    videos: (data.videos ?? []).map(toVideoCard),
    nextCursor: data.nextCursor ?? null,
  };
};
