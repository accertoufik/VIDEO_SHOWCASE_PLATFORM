import { useAuth } from '@clerk/clerk-expo';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getNotifications } from '@/api/notifications';
import { useAppActive } from '@/hooks/useAppActive';
import { useApi } from '@/lib/auth/useApi';

export const NOTIFICATIONS_KEY = ['notifications'] as const;
export const NOTIFICATIONS_LIST_KEY = [...NOTIFICATIONS_KEY, 'list'] as const;
export const NOTIFICATIONS_UNREAD_KEY = [
  ...NOTIFICATIONS_KEY,
  'unread',
] as const;

const PAGE_SIZE = 20;

export const useNotifications = () => {
  const api = useApi();
  const { isSignedIn } = useAuth();
  return useInfiniteQuery({
    queryKey: NOTIFICATIONS_LIST_KEY,
    queryFn: ({ pageParam, signal }) =>
      getNotifications(api, { limit: PAGE_SIZE, cursor: pageParam, signal }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(isSignedIn),
    staleTime: 30_000,
  });
};

/** Just the badge number: asks for one item, since the response carries the total. Re-checked each minute while the app is open. */
export const useUnreadCount = () => {
  const api = useApi();
  const { isSignedIn } = useAuth();
  const appActive = useAppActive();
  return useQuery({
    queryKey: NOTIFICATIONS_UNREAD_KEY,
    queryFn: async ({ signal }) =>
      (await getNotifications(api, { limit: 1, signal })).unreadCount,
    enabled: Boolean(isSignedIn),
    staleTime: 30_000,
    refetchInterval: appActive ? 60_000 : false,
  });
};
