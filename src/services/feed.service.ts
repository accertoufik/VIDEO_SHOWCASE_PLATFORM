import { prisma } from '../config/db';
import { ApiError } from '../middleware/errorHandler';

const PUBLIC_FEED_WHERE = {
  status: 'READY' as const,
  visibility: 'PUBLIC' as const,
  deletedAt: null,
};

export const FeedService = {
  /** Home Feed - newest published PUBLIC videos, paginated with cursor (video id) */
  getHomeFeed: async (
    cursorVideoId: string | undefined,
    limit: number,
    categoryId?: string,
  ) => {
    try {
      const videos = await prisma.video.findMany({
        where: {
          ...PUBLIC_FEED_WHERE,
          ...(categoryId ? { categoryId } : {}),
        },
        include: { thumbnailAsset: true, creator: { include: { user: true } }, category: true },
        orderBy: { createdAt: 'desc' },
        take: limit + 1, // fetch one extra to see if there's a next page
        cursor: cursorVideoId ? { id: cursorVideoId } : undefined,
        skip: cursorVideoId ? 1 : 0, // skip the cursor itself if provided
      });

      const hasNextPage = videos.length > limit;
      const page = hasNextPage ? videos.slice(0, limit) : videos;
      if (page.length === 0) {
        return { videos: [], nextCursor: null };
      }
      const nextCursor = hasNextPage
        ? (page[page.length - 1]?.id ?? null)
        : null;

      return { videos: page, nextCursor };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to fetch home feed', error);
    }
  },

  /** Basic title search — case-insensitive substring match, PUBLIC videos only. */
  searchVideos: async (query: string, limit: number) => {
    try {
      const videos = await prisma.video.findMany({
        where: {
          ...PUBLIC_FEED_WHERE,
          title: { contains: query, mode: 'insensitive' },
        },
        include: { thumbnailAsset: true, creator: true },
        orderBy: { viewCount: 'desc' },
        take: limit,
      });
      return videos;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to search videos', error);
    }
  },

  /**
   * Trending = a time-decayed engagement score, NOT just "most viewed of
   * all time" (that would let a 6-month-old video sit at #1 forever) and
   * NOT just "newest" (that's the home feed already). The formula:
   *
   *   score = (views*1 + likes*3 + comments*4 + shares*5) / (hoursSincePublished + 2)^1.5
   *
   * - Likes/comments/shares are weighted higher than raw views, since
   *   they're a stronger signal of "people actually cared" than a view
   *   (which just means someone opened it).
   * - Dividing by (age in hours + 2)^1.5 is the decay term — same shape
   *   as Hacker News/Reddit "hot" ranking. The "+2" stops brand-new
   *   videos (age ~0) from dividing by a tiny number and producing a
   *   wildly inflated score; the ^1.5 makes the decay bite harder as a
   *   video ages, so yesterday's video naturally drops behind today's.
   * - Only videos published within `windowDays` are considered at all —
   *   trending is inherently about "right now", so nothing older than
   *   the window is even scored, regardless of how high its score would be.
   *
   * Split by `type` (LONG_FORM vs SHORT_FORM) because watch behavior is
   * different enough that mixing them into one ranked list isn't
   * meaningful — a Short with 50K views and a 20-minute video with 50K
   * views don't represent the same thing. `categoryId` is optional —
   * omit it for a platform-wide trending list, or pass it for
   * "Trending in Gaming", etc.
   */

  getTrending: async (options: {
    type: 'LONG_FORM' | 'SHORT_FORM';
    categoryId?: string;
    windowDays: number;
    limit: number;
  }) => {
    try {
      const { type, categoryId, windowDays, limit } = options;

      // Raw SQL is needed here because the score involves a computed
      // expression (time decay) that Prisma's query builder can't express —
      // it can only sort by a real column, not by a formula. We only ask
      // the DB for ids + score, in ranked order; the actual video rows
      // (with all their relations) are fetched afterward via a normal
      // Prisma query and re-sorted client-side to match this ranking.

      const ranked = await prisma.$queryRaw<
        Array<{ id: string; score: number }>
      >`
      SELECT
          id,
          (
            ("viewCount"::float * 1 + "likeCount"::float * 3 + "commentCount"::float * 4 + "shareCount"::float * 5)
            / POWER(EXTRACT(EPOCH FROM (NOW() - "publishedAt")) / 3600.0 + 2, 1.5)
          ) AS score
        FROM videos
        WHERE status = 'READY'
          AND visibility = 'PUBLIC'
          AND "deletedAt" IS NULL
          AND type = ${type}::"VideoType"
          AND "publishedAt" IS NOT NULL
          AND "publishedAt" >= NOW() - (${windowDays} || ' days')::interval
          AND (${categoryId == null} OR "categoryId" = ${categoryId ?? null})
        ORDER BY score DESC
        LIMIT ${limit}
      `;

      // If no videos are found, return an empty array to avoid unnecessary queries
      if (ranked.length === 0) {
        return { videos: [] };
      }

      const videoRows = await prisma.video.findMany({
        where: { id: { in: ranked.map((r) => r.id) } },
        include: {
          thumbnailAsset: true,
          creator: { include: { user: true, profile: true } },
          category: true,
        },
      });

      // The raw query above already put ids in ranked order — findMany's
      // `in` filter does NOT preserve that order, so we re-sort here.
      const byId = new Map(videoRows.map((v) => [v.id, v]));
      const sortedVideos = ranked
        .map((r) => byId.get(r.id))
        .filter((v): v is (typeof videoRows)[number] => !!v);
      return { videos: sortedVideos };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to fetch trending videos', error);
    }
  },
};
