import type {
  DailyViews,
  StudioCommentsPage,
  StudioOverview,
  TopVideo,
  VideoAnalytics,
} from '@/types/studio';
import type { Api } from './client';

const required = { auth: 'required' } as const;

type Raw = Record<string, unknown>;
// Counters can arrive as numbers or (BigInt) strings.
const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : null;

const toSeries = (raw: unknown): DailyViews[] =>
  ((raw as Raw[] | undefined) ?? []).map((d) => ({
    date: String(d.date),
    views: num(d.views),
  }));

export const getStudioOverview = async (
  api: Api,
  days: number,
  signal?: AbortSignal,
): Promise<StudioOverview> => {
  const d = await api.get<Raw>(`/api/studio/overview?days=${days}`, {
    ...required,
    signal,
  });
  const totals = (d.totals ?? {}) as Raw;
  const period = (d.period ?? {}) as Raw;
  return {
    periodDays: num(d.periodDays) || days,
    totals: {
      videos: num(totals.videos),
      followers: num(totals.followers),
      views: num(totals.views),
      likes: num(totals.likes),
      comments: num(totals.comments),
      shares: num(totals.shares),
    },
    period: {
      views: num(period.views),
      newFollowers: num(period.newFollowers),
    },
    viewsByDay: toSeries(d.viewsByDay),
    topVideos: ((d.topVideos as Raw[] | undefined) ?? []).map<TopVideo>(
      (v) => ({
        id: String(v.id),
        title: str(v.title) ?? '',
        viewCount: num(v.viewCount),
        likeCount: num(v.likeCount),
        commentCount: num(v.commentCount),
        thumbnailUrl: str(v.thumbnailUrl),
      }),
    ),
  };
};

export const getVideoAnalytics = async (
  api: Api,
  videoId: string,
  days: number,
  signal?: AbortSignal,
): Promise<VideoAnalytics> => {
  const d = await api.get<Raw>(
    `/api/studio/videos/${videoId}/analytics?days=${days}`,
    { ...required, signal },
  );
  const life = (d.lifetime ?? {}) as Raw;
  const period = (d.period ?? {}) as Raw;
  const eng = (d.engagement ?? {}) as Raw;
  return {
    videoId: String(d.videoId ?? videoId),
    title: str(d.title) ?? '',
    periodDays: num(d.periodDays) || days,
    lifetime: {
      views: num(life.views),
      likes: num(life.likes),
      comments: num(life.comments),
      shares: num(life.shares),
    },
    period: {
      views: num(period.views),
      uniqueViewers: num(period.uniqueViewers),
    },
    engagement: {
      watchers: num(eng.watchers),
      averageCompletionPercent: num(eng.averageCompletionPercent),
      completedCount: num(eng.completedCount),
    },
    viewsByDay: toSeries(d.viewsByDay),
  };
};

export const getStudioComments = async (
  api: Api,
  opts: {
    videoId?: string;
    cursor?: string;
    limit?: number;
    signal?: AbortSignal;
  },
): Promise<StudioCommentsPage> => {
  const params = new URLSearchParams({ limit: String(opts.limit ?? 20) });
  if (opts.cursor) params.set('cursor', opts.cursor);
  if (opts.videoId) params.set('videoId', opts.videoId);

  const d = await api.get<Raw>(`/api/studio/comments?${params}`, {
    ...required,
    signal: opts.signal,
  });
  return {
    items: ((d.comments as Raw[] | undefined) ?? []).map((c) => {
      const video = (c.video ?? {}) as Raw;
      const author = (c.author ?? {}) as Raw;
      return {
        id: String(c.id),
        body: String(c.body ?? ''),
        createdAt: String(c.createdAt),
        isReply: Boolean(c.isReply),
        parentCommentId: str(c.parentCommentId),
        video: { id: String(video.id), title: str(video.title) ?? '' },
        author: {
          username: str(author.username),
          displayName: str(author.displayName),
        },
      };
    }),
    nextCursor: str(d.nextCursor),
  };
};

/** Moderation delete. Removing a top-level comment also removes its replies. */
export const removeStudioComment = (api: Api, commentId: string) =>
  api.del(`/api/studio/comments/${commentId}`, undefined, required);
