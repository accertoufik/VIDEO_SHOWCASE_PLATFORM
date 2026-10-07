export type NotificationType =
  | 'NEW_FOLLOWER'
  | 'NEW_VIDEO_FROM_FOLLOWED'
  | 'COMMENT_REPLY'
  | 'VIDEO_LIKED'
  | 'VIDEO_COMMENTED'
  | 'SYSTEM';

export type AppNotification = {
  id: string;
  /** "UNKNOWN" if the backend adds a type this build doesn't know. */
  type: NotificationType | 'UNKNOWN';
  title: string;
  body: string | null;
  read: boolean;
  createdAt: string;
  videoId: string | null;
  actor: { name: string; username: string; avatarUrl: string | null } | null;
  video: { id: string; title: string; thumbnailUrl: string | null } | null;
};

export type NotificationsPage = {
  items: AppNotification[];
  nextCursor: string | null;
  unreadCount: number;
};
