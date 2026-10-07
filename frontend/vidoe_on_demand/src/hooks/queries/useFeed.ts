import { useInfiniteQuery } from '@tanstack/react-query';
import { getFeed } from '@/api/feed';
import { useApi } from '@/lib/auth/useApi';
import { queryKeys } from '@/lib/query/queryKeys';

/** Infinite long-form feed. Optional category filter. Stops when nextCursor is null. */
export const useFeed = (categoryId?: string) => {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: queryKeys.feed(categoryId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getFeed(api, { cursor: pageParam, categoryId, signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 2 * 60_000, // don't re-download every scrolled page each time Home regains focus
  });
};
