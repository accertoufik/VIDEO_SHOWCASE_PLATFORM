import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  searchAll,
  searchCategories,
  searchCreators,
  searchVideos,
} from '@/api/search';
import { useApi } from '@/lib/auth/useApi';

// Each hook is only mounted by the pane for the active tab, so only that tab's request runs.
const STALE = 60_000;

export const useSearchAll = (q: string) => {
  const api = useApi();
  return useQuery({
    queryKey: ['search', 'all', q],
    queryFn: ({ signal }) => searchAll(api, { q, signal }),
    enabled: q.length > 0,
    staleTime: STALE,
  });
};

export const useSearchVideos = (q: string) => {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: ['search', 'videos', q],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      searchVideos(api, { q, cursor: pageParam, signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: q.length > 0,
    staleTime: STALE,
  });
};

export const useSearchCreators = (q: string) => {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: ['search', 'creators', q],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      searchCreators(api, { q, cursor: pageParam, signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: q.length > 0,
    staleTime: STALE,
  });
};

export const useSearchTopics = (q: string) => {
  const api = useApi();
  return useQuery({
    queryKey: ['search', 'topics', q],
    queryFn: ({ signal }) => searchCategories(api, { q, signal }),
    enabled: q.length > 0,
    staleTime: STALE,
  });
};
