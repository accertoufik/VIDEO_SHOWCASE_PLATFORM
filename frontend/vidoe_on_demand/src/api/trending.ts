import type { VideoCardData, VideoType } from '@/types/video';
import { withQuery } from '@/utils/query';
import type { Api } from './client';
import { toVideoCard } from './mappers';

/** Ranking is computed by the backend. The client only displays the order it gets. */
export const getTrending = async (
  api: Api,
  params: {
    type: VideoType;
    categoryId?: string;
    windowDays?: number;
    limit?: number;
    signal?: AbortSignal;
  },
): Promise<VideoCardData[]> => {
  const path = withQuery('/api/trending', {
    type: params.type,
    categoryId: params.categoryId,
    windowDays: params.windowDays ?? 7,
    limit: params.limit ?? 10,
  });
  const data = await api.get<{ videos?: Array<Record<string, unknown>> }>(
    path,
    { auth: 'none', signal: params.signal },
  );
  return (data.videos ?? []).map(toVideoCard);
};
