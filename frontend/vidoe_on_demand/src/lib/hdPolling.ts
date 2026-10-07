import type { MyVideo } from '@/types/creatorVideo';
import type { VideoDetail } from '@/types/video';

export const HD_POLL_FAST_MS = 5_000;
export const HD_POLL_SLOW_MS = 30_000;
/** Poll fast for the first few minutes (the usual case), then back off. */
const FAST_WINDOW_MS = 3 * 60_000;
/** Give up after this long on one screen visit: a stuck HD job must not poll forever. */
const MAX_WINDOW_MS = 15 * 60_000;

/**
 * How long to wait before re-checking a video, or false to stop.
 * Stops on: HD ready, FAILED/DELETED, nothing streamable yet, or the time cap.
 * (Screen focus and app state are handled by the caller.)
 */
export const hdPollInterval = (
  video: VideoDetail | undefined,
  elapsedMs: number,
): number | false => {
  if (!video) return false;
  if (video.status === 'FAILED' || video.status === 'DELETED') return false;
  if (!video.hasStream) return false;
  if (video.hdReady) return false;
  if (elapsedMs >= MAX_WINDOW_MS) return false;
  return elapsedMs < FAST_WINDOW_MS ? HD_POLL_FAST_MS : HD_POLL_SLOW_MS;
};

const HD_PENDING_MAX_AGE_MS = 60 * 60_000;

/** For My videos: a watchable video, recently created, whose HD isn't done yet. Old rows with a stuck job don't count. */
export const isHdPending = (video: MyVideo): boolean =>
  (video.status === 'READY' || video.status === 'PUBLISHED') &&
  !video.hdReady &&
  Date.now() - Date.parse(video.createdAt) < HD_PENDING_MAX_AGE_MS;
