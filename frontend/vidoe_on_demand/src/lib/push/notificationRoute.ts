import type { Href } from 'expo-router';

type Target = {
  type?: string | null;
  videoId?: string | null;
  username?: string | null;
};

/**
 * Where a notification opens. null = nothing specific to open.
 * SYSTEM + videoId is the creator-facing "ready / HD ready" message: it goes to My videos, where Publish lives.
 */
export const notificationHref = ({
  type,
  videoId,
  username,
}: Target): Href | null => {
  if (type === 'SYSTEM') return videoId ? '/content' : null;
  if (videoId) return `/video/${videoId}`;
  if (type === 'NEW_FOLLOWER' && username) return `/creator/${username}`;
  return null;
};
