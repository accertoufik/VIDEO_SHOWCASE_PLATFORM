import { useAuth } from '@clerk/clerk-expo';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getFollowing } from '@/api/following';
import { useApi } from '@/lib/auth/useApi';

// Paged by the server's own `nextCursor`.
export const useFollowing = () => {
  const api = useApi();
  const { isSignedIn } = useAuth();
  return useInfiniteQuery({
    queryKey: ['following'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getFollowing(api, { cursor: pageParam, signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(isSignedIn),
    staleTime: 0, // follow/unfollow elsewhere changes this list
    refetchOnMount: 'always',
  });
};
