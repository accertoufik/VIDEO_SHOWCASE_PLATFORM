import { useInfiniteQuery } from '@tanstack/react-query';
import { getShorts } from '@/api/shorts';
import { useApi } from '@/lib/auth/useApi';
import { queryKeys } from '@/lib/query/queryKeys';

export const useShorts = (categoryId?: string) => {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: queryKeys.shorts(categoryId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getShorts(api, { cursor: pageParam, categoryId, signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
};
