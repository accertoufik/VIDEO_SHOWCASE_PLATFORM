// One factory so keys are never hand-typed twice. Later phases extend this.
export const queryKeys = {
  me: ['me'] as const,
  categories: ['categories'] as const,
  feed: (categoryId?: string) =>
    ['feed', { categoryId: categoryId ?? null }] as const,
  shorts: (categoryId?: string) =>
    ['shorts', { categoryId: categoryId ?? null }] as const,
  video: (videoId: string) => ['video', videoId] as const,
  trending: (categoryId?: string) => ['trending', categoryId ?? 'all'] as const,
  related: (id: string) => ['related', id] as const,
  comments: (id: string) => ['comments', id] as const,
};
