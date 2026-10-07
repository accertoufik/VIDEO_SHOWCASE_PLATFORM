import type {
  AppNotification,
  NotificationsPage,
  NotificationType,
} from '@/types/notification';
import type { Api } from './client';

const required = { auth: 'required' } as const;

type Raw = Record<string, unknown>;

const TYPES: NotificationType[] = [
  'NEW_FOLLOWER',
  'NEW_VIDEO_FROM_FOLLOWED',
  'COMMENT_REPLY',
  'VIDEO_LIKED',
  'VIDEO_COMMENTED',
  'SYSTEM',
];
const str = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : null;

const toNotification = (raw: Raw): AppNotification => {
  const actor = raw.actor as Raw | null | undefined;
  const video = raw.video as Raw | null | undefined;
  return {
    id: String(raw.id),
    type: TYPES.includes(raw.type as NotificationType)
      ? (raw.type as NotificationType)
      : 'UNKNOWN',
    title: str(raw.title) ?? '',
    body: str(raw.body),
    read: raw.readAt != null,
    createdAt: String(raw.createdAt),
    videoId: str(raw.videoId),
    actor: actor
      ? {
          name: str(actor.displayName) ?? 'Someone',
          username: str(actor.username) ?? '',
          avatarUrl: str(actor.avatarUrl),
        }
      : null,
    video: video
      ? {
          id: String(video.id),
          title: str(video.title) ?? '',
          thumbnailUrl: str(video.thumbnailUrl),
        }
      : null,
  };
};

export const getNotifications = async (
  api: Api,
  opts: { limit?: number; cursor?: string; signal?: AbortSignal } = {},
): Promise<NotificationsPage> => {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.cursor) params.set('cursor', opts.cursor);
  const query = params.toString();

  const data = await api.get<Raw>(
    `/api/notifications${query ? `?${query}` : ''}`,
    { ...required, signal: opts.signal },
  );
  // The plan documents `UnreadCount`; the backend sends `unreadCount`. Accept both.
  const unread = Number(data.unreadCount ?? data.UnreadCount ?? 0);

  return {
    items: ((data.notifications as Raw[] | undefined) ?? []).map(
      toNotification,
    ),
    nextCursor: str(data.nextCursor),
    unreadCount: Number.isFinite(unread) ? unread : 0,
  };
};

export const markNotificationRead = (api: Api, id: string) =>
  api.patch(`/api/notifications/${id}/read`, undefined, required);

export const markAllNotificationsRead = (api: Api) =>
  api.patch('/api/notifications/read-all', undefined, required);

export const clearAllNotifications = (api: Api) =>
  api.del('/api/notifications', undefined, required);
