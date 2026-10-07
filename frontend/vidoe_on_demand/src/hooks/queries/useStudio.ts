import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  getStudioComments,
  getStudioOverview,
  getVideoAnalytics,
} from '@/api/studio';
import { useApi } from '@/lib/auth/useApi';

/** All studio data lives under ["studio", ...], which the upload hook already invalidates. */
export const STUDIO_KEY = ['studio'] as const;
export const STUDIO_OVERVIEW_KEY = [...STUDIO_KEY, 'overview'] as const;
export const STUDIO_COMMENTS_KEY = [...STUDIO_KEY, 'comments'] as const;

export const useStudioOverview = (days: number) => {
  const api = useApi();
  return useQuery({
    queryKey: [...STUDIO_OVERVIEW_KEY, days],
    queryFn: ({ signal }) => getStudioOverview(api, days, signal),
    staleTime: 60_000,
  });
};

export const useVideoAnalytics = (videoId: string, days: number) => {
  const api = useApi();
  return useQuery({
    queryKey: [...STUDIO_KEY, 'analytics', videoId, days],
    queryFn: ({ signal }) => getVideoAnalytics(api, videoId, days, signal),
    enabled: Boolean(videoId),
    staleTime: 60_000,
  });
};

export const useStudioComments = (videoId?: string) => {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: [...STUDIO_COMMENTS_KEY, videoId ?? 'all'],
    queryFn: ({ pageParam, signal }) =>
      getStudioComments(api, { videoId, cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  });
};
