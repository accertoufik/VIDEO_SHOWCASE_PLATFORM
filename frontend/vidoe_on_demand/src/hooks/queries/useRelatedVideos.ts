import { useQuery } from '@tanstack/react-query';
import { getRelated } from '@/api/video';
import { useApi } from '@/lib/auth/useApi';
import { queryKeys } from '@/lib/query/queryKeys';

export const useRelatedVideos = (id: string) => {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.related(id),
    queryFn: ({ signal }) => getRelated(api, id, signal),
    enabled: Boolean(id),
    staleTime: 2 * 60_000,
  });
};
