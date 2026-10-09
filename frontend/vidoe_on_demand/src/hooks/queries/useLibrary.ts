import { useAuth } from '@clerk/clerk-expo';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  getContinueWatching,
  getFollowers,
  getFollowing,
  getHistory,
  getLikedVideos,
  getSavedVideos,
} from '@/api/library';
import type { Api } from '@/api/client';
import { useApi } from '@/lib/auth/useApi';
import type { LibraryPage } from '@/types/library';

type Fetcher<T> = (
  api: Api,
  p: { cursor?: string; limit: number; signal?: AbortSignal },
) => Promise<LibraryPage<T>>;

/** Prefix for every library query, so one invalidate refreshes them all. */
export const LIBRARY_KEY = ['library'] as const;

// One page size for every use of a list. The Overview used to ask for 10 and the full tab for 20, which are
// DIFFERENT cache entries, so opening a tab re-downloaded what Overview had just loaded. Now they share one
// entry and Overview just shows the first few items of it.
const PAGE_SIZE = 20;

const useCursorList = <T>(name: string, fetcher: Fetcher<T>) => {
  const limit = PAGE_SIZE;
  const api = useApi();
  const { isSignedIn } = useAuth();
  return useInfiniteQuery({
    queryKey: [...LIBRARY_KEY, name],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      fetcher(api, { cursor: pageParam, limit, signal }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(isSignedIn),
    staleTime: 2 * 60_000, // switching tabs inside this window never refetches
  });
};

export const useContinueWatching = () => useCursorList('continue', getContinueWatching);
export const useHistory = () => useCursorList('history', getHistory);
export const useLikedVideos = () => useCursorList('liked', getLikedVideos);
export const useSavedVideos = () => useCursorList('saved', getSavedVideos);
export const useFollowing = () => useCursorList('following', getFollowing);
export const useFollowers = () => useCursorList('followers', getFollowers);
