import type { PlaybackProgress, VideoCardData } from './video';

export type LibraryPage<T> = { items: T[]; nextCursor: string | null };

/** One video in any library list (continue, history, liked, saved). `progress` is only set for the first two. */
export type LibraryVideo = {
  /** Unique within its list: historyId / progressId / row id. */
  key: string;
  video: VideoCardData;
  progress: PlaybackProgress | null;
};
