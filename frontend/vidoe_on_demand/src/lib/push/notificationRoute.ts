import type { Href } from 'expo-router';

type Target = {
  type?: string | null;
  videoId?: string | null;
  username?: string | null;
  /** LONG_FORM or SHORT_FORM, when the notification is about a video. */
  videoType?: string | null;
};

// Notifications that are about people reacting to a video. For a Short these open its comments, so the owner
// can see who commented or replied and where.
const REACTIONS = new Set(['VIDEO_LIKED', 'VIDEO_COMMENTED', 'COMMENT_REPLY']);

/**
 * Where a notification opens. null = nothing specific to open.
 * SYSTEM + videoId is the creator-facing "ready / HD ready" message: it goes to My videos, where Publish lives.
 * A notification about a Short opens the Shorts tab on that Short (comments open for likes, comments and replies).
 */
export const notificationHref = ({ type, videoId, username, videoType }: Target): Href | null => {
  if (type === 'SYSTEM') return videoId ? '/content' : null;
  if (videoId && videoType === 'SHORT_FORM') {
    return {
      pathname: '/shorts',
      params: {
        video: videoId,
        ...(type && REACTIONS.has(type) ? { comments: '1' } : {}),
        // Changes on every tap, so tapping the same notification twice still re-opens it.
        t: String(Date.now()),
      },
    };
  }
  if (videoId) return `/video/${videoId}`;
  if (type === 'NEW_FOLLOWER' && username) return `/creator/${username}`;
  return null;
};
