import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  followCreator,
  getCreatorPage,
  getCreatorVideos,
  unfollowCreator,
  type CreatorPage,
} from '@/api/creator';
import { useApi } from '@/lib/auth/useApi';
import { queryKeys } from '@/lib/query/queryKeys';
import type { Me } from '@/types/user';

const pageKey = (username: string) => ['creator', username] as const;

export const useCreatorPage = (username: string) => {
  const api = useApi();
  return useQuery({
    queryKey: pageKey(username),
    queryFn: ({ signal }) => getCreatorPage(api, username, signal),
    enabled: Boolean(username),
  });
};

/** One creator's public videos of ONE format: full-length videos or Shorts. */
export const useCreatorVideos = (
  creatorId: string | undefined,
  type: 'LONG_FORM' | 'SHORT_FORM',
) => {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: ['creator-videos', creatorId ?? null, type],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      getCreatorVideos(api, creatorId as string, { cursor: pageParam, type, signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(creatorId),
  });
};

/** Follow / unfollow with an instant UI update that rolls back if the request fails. */
export const useToggleFollow = (username: string, creatorId?: string) => {
  const api = useApi();
  const queryClient = useQueryClient();
  const key = pageKey(username);

  return useMutation({
    mutationFn: (follow: boolean) =>
      follow ? followCreator(api, creatorId as string) : unfollowCreator(api, creatorId as string),
    onMutate: async (follow) => {
      await queryClient.cancelQueries({ queryKey: key });
      // Your own "Following" count on the Profile tab moves at once too.
      queryClient.setQueryData<Me>(queryKeys.me, (me) =>
        me ? { ...me, followingCount: Math.max(0, (me.followingCount ?? 0) + (follow ? 1 : -1)) } : me,
      );
      const previous = queryClient.getQueryData<CreatorPage>(key);
      if (previous) {
        queryClient.setQueryData<CreatorPage>(key, {
          ...previous,
          isFollowing: follow,
          followerCount: Math.max(0, previous.followerCount + (follow ? 1 : -1)),
        });
      }
      return { previous };
    },
    onError: (_error, _follow, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
      // The optimistic changes were wrong: reload the real numbers.
      queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
    // On success the optimistic values are already right, so no blocking refetch of the channel page. Only the
    // Following list (a different screen) is marked stale, to be refreshed when it is next opened.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['following'], refetchType: 'none' });
    },
  });
};
