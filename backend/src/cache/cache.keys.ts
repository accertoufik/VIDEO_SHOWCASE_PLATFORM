// Only PUBLIC, viewer-independent data gets a key here. Never put isLiked / isSaved / progress / /me data in the cache.
export const cacheKeys = {
  categories: () => 'categories:all',
  trending: (type: string, categoryId: string | undefined, windowDays: number, limit: number) =>
    `trending:${type}:${categoryId ?? 'all'}:${windowDays}:${limit}`,
  creatorProfile: (username: string) => `creator:profile:${username.toLowerCase()}`,
  related: (videoId: string, limit: number) => `related:${videoId}:${limit}`,
};
