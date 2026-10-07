import { useQuery } from '@tanstack/react-query';
import { getComments } from '@/api/social';
import { useApi } from '@/lib/auth/useApi';
import { queryKeys } from '@/lib/query/queryKeys';

/** Only fetched once the comments sheet opens. */
export const useComments = (videoId: string, enabled: boolean) => {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.comments(videoId),
    queryFn: ({ signal }) => getComments(api, videoId, signal),
    enabled,
    staleTime: 30_000,
  });
};
