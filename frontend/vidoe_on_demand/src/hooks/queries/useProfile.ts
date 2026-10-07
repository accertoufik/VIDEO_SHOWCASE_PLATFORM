import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  getCreatorVideos,
  getPublicProfile,
  type CreatorVideoType,
} from '@/api/profile';
import { useApi } from '@/lib/auth/useApi';

export const PROFILE_KEY = ['profile'] as const;

export const usePublicProfile = (username: string) => {
  const api = useApi();
  return useQuery({
    queryKey: [...PROFILE_KEY, username],
    queryFn: ({ signal }) => getPublicProfile(api, username, signal),
    enabled: Boolean(username),
    staleTime: 60_000,
  });
};

export const useCreatorVideos = (
  creatorId: string | undefined,
  type: CreatorVideoType,
) => {
  const api = useApi();
  return useInfiniteQuery({
    queryKey: ['creator-videos', creatorId, type],
    queryFn: ({ pageParam, signal }) =>
      getCreatorVideos(api, creatorId as string, {
        type,
        cursor: pageParam,
        signal,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(creatorId),
    staleTime: 60_000,
  });
};
