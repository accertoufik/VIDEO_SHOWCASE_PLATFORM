import type { PlaybackProgress, VideoCardData } from './video';

export type LibraryPage<T> = { items: T[]; nextCursor: string | null };

/** One video in any library list (continue, history, liked, saved). `progress` is only set for the first two. */
export type LibraryVideo = {
  /** Unique within its list: historyId / progressId / row id. */
  key: string;
  video: VideoCardData;
  progress: PlaybackProgress | null;
};

/** Someone who follows your channel. They are ordinary users, not necessarily creators. */
export type Follower = {
  /** The follow row id: unique in the list. */
  id: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  followedAt: string;
};
