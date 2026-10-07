import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  clearAllNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/api/notifications';
import {
  NOTIFICATIONS_LIST_KEY,
  NOTIFICATIONS_UNREAD_KEY,
} from '@/hooks/queries/useNotifications';
import { useApi } from '@/lib/auth/useApi';
import type { NotificationsPage } from '@/types/notification';

type ListData = InfiniteData<NotificationsPage>;

/** Optimistic: the row and the badge update at once; a failure puts them back. */
const useOptimistic = () => {
  const qc = useQueryClient();

  return async (
    patch: (
      list: ListData | undefined,
      unread: number | undefined,
    ) => { list?: ListData; unread?: number },
  ) => {
    await Promise.all([
      qc.cancelQueries({ queryKey: NOTIFICATIONS_LIST_KEY }),
      qc.cancelQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY }),
    ]);
    const prevList = qc.getQueryData<ListData>(NOTIFICATIONS_LIST_KEY);
    const prevUnread = qc.getQueryData<number>(NOTIFICATIONS_UNREAD_KEY);

    const next = patch(prevList, prevUnread);
    if (next.list) qc.setQueryData(NOTIFICATIONS_LIST_KEY, next.list);
    if (next.unread !== undefined)
      qc.setQueryData(NOTIFICATIONS_UNREAD_KEY, next.unread);

    return () => {
      qc.setQueryData(NOTIFICATIONS_LIST_KEY, prevList);
      qc.setQueryData(NOTIFICATIONS_UNREAD_KEY, prevUnread);
    };
  };
};

export const useMarkRead = () => {
  const api = useApi();
  const qc = useQueryClient();
  const optimistic = useOptimistic();

  return useMutation({
    mutationFn: (id: string) => markNotificationRead(api, id),
    onMutate: (id) =>
      optimistic((list, unread) => {
        const wasUnread =
          list?.pages.some((p) =>
            p.items.some((n) => n.id === id && !n.read),
          ) ?? false;
        return {
          list: list && {
            ...list,
            pages: list.pages.map((p) => ({
              ...p,
              items: p.items.map((n) =>
                n.id === id ? { ...n, read: true } : n,
              ),
            })),
          },
          unread:
            wasUnread && unread != null ? Math.max(0, unread - 1) : undefined,
        };
      }),
    onError: (_e, _id, rollback) => rollback?.(),
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY }),
    meta: { silent: true },
  });
};

export const useMarkAllRead = () => {
  const api = useApi();
  const qc = useQueryClient();
  const optimistic = useOptimistic();

  return useMutation({
    mutationFn: () => markAllNotificationsRead(api),
    onMutate: () =>
      optimistic((list) => ({
        list: list && {
          ...list,
          pages: list.pages.map((p) => ({
            ...p,
            items: p.items.map((n) => ({ ...n, read: true })),
          })),
        },
        unread: 0,
      })),
    onError: (_e, _v, rollback) => rollback?.(),
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY }),
  });
};

/** Deletes every notification. The list empties and the badge clears at once; a failure puts them back. */
export const useClearNotifications = () => {
  const api = useApi();
  const qc = useQueryClient();
  const optimistic = useOptimistic();

  return useMutation({
    mutationFn: () => clearAllNotifications(api),
    onMutate: () =>
      optimistic((list) => ({
        list: list && {
          ...list,
          pages: list.pages.map((p) => ({ ...p, items: [], nextCursor: null })),
        },
        unread: 0,
      })),
    onError: (_e, _v, rollback) => rollback?.(),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_LIST_KEY });
    },
  });
};
