import type { QueryClient } from '@tanstack/react-query';
import type { VideoCardData } from '@/types/video';

const KEYS = ['pages', 'videos', 'items', 'video', 'data'] as const;

const scan = (value: unknown, id: string, depth = 0): VideoCardData | null => {
  if (!value || typeof value !== 'object' || depth > 5) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const hit = scan(entry, id, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const o = value as Record<string, unknown>;
  if (o.id === id && typeof o.title === 'string' && o.creator) {
    return o as unknown as VideoCardData;
  }
  for (const key of KEYS) {
    if (key in o) {
      const hit = scan(o[key], id, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
};

/**
 * Finds a video's card data (title, creator, thumbnail...) in anything the app has already loaded: the feed,
 * trending, related, library lists. Lets the video page show its details instantly while the full video
 * request (and the player) is still loading.
 */
export const findCachedCard = (qc: QueryClient, id: string): VideoCardData | null => {
  for (const query of qc.getQueryCache().getAll()) {
    const hit = scan(query.state.data, id);
    if (hit) return hit;
  }
  return null;
};
