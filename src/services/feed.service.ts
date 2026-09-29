import { prisma } from '../config/db';
import type { Prisma } from '../../generated/prisma/client';
import { ApiError } from '../middleware/errorHandler';
//additional import to get creator specific data
import { mergeUnique, PUBLIC_VIDEO_WHERE, toPage } from '../lib/videoWhere';
import { VideoService } from './video.service';

// FIX: a video is live once it's PUBLISHED (what VideoService.publish sets).
// The old filter only matched READY, which excluded every video published
// through the publish flow — they'd finish processing, get published, and
// then never show up in the feed, search or trending. READY stays in the
// list so a video is at least visible to its own owner-adjacent checks
// before an explicit publish (defensive — publish() is what actually flips
// visibility to PUBLIC, so a plain READY row is normally still PRIVATE and
// won't match `visibility: PUBLIC` anyway).
const PUBLIC_FEED_WHERE = PUBLIC_VIDEO_WHERE;

const FEED_ORDER_BY: Prisma.VideoOrderByWithRelationInput[] = [
  { publishedAt: { sort: 'desc', nulls: 'last' } },
  { id: 'desc' },
];



/**
 * One cursor-paginated page of PUBLIC videos of ONE format. Shared by the
 * home feed (LONG_FORM) and the shorts feed (SHORT_FORM).
 */
const getPublicFeedPage = async (
  type: 'LONG_FORM' | 'SHORT_FORM',
  cursorVideoId: string | undefined,
  limit: number,
  categoryId?: string,
) => {
  const videos = await prisma.video.findMany({
    where: {
      ...PUBLIC_FEED_WHERE,
      type,
      ...(categoryId ? { categoryId } : {}),
    },
    include: { thumbnailAsset: true, creator: { include: { user: { select: { id: true, role: true } } } }, category: true },
    // nulls last — a row with no publishedAt (shouldn't normally happen for
    // a live video, but defensively) never floats above real videos.
    orderBy: [{ publishedAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    take: limit + 1, // fetch one extra to see if there's a next page
    cursor: cursorVideoId ? { id: cursorVideoId } : undefined,
    skip: cursorVideoId ? 1 : 0, // skip the cursor itself if provided
  });

  const hasNextPage = videos.length > limit;
  const page = hasNextPage ? videos.slice(0, limit) : videos;
  if (page.length === 0) {
    return { videos: [], nextCursor: null };
  }
  const nextCursor = hasNextPage ? (page[page.length - 1]?.id ?? null) : null;

  return { videos: page, nextCursor };
};

export const FeedService = {
  // Home feed = LONG_FORM only. Shorts never appear here; they have their
  // own section (GET /api/shorts).
  getHomeFeed: async (
    cursorVideoId: string | undefined,
    limit: number,
    categoryId?: string,
  ) => {
    try {
      return await getPublicFeedPage(
        'LONG_FORM',
        cursorVideoId,
        limit,
        categoryId,
      );
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to fetch home feed', error);
    }
  },

  // Shorts section = SHORT_FORM only, same pagination shape as the home feed.
  getShortsFeed: async (
    cursorVideoId: string | undefined,
    limit: number,
    categoryId?: string,
  ) => {
    try {
      return await getPublicFeedPage(
        'SHORT_FORM',
        cursorVideoId,
        limit,
        categoryId,
      );
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to fetch shorts feed', error);
    }
  },

  /** Basic title search — case-insensitive substring match, PUBLIC videos only. */

  // searchVideos: async (query: string, limit: number) => {
  //   try {
  //     const videos = await prisma.video.findMany({
  //       where: {
  //         ...PUBLIC_FEED_WHERE,
  //         title: { contains: query, mode: 'insensitive' },
  //       },
  //       include: { thumbnailAsset: true, creator: true },
  //       orderBy: { viewCount: 'desc' },
  //       take: limit,
  //     });
  //     return videos;
  //   } catch (error) {
  //     if (error instanceof ApiError) {
  //       throw error;
  //     }
  //     throw new ApiError(500, 'Failed to search videos', error);
  //   }
  // },

  /**
   * Search v2 — backward compatible (no `scope` = videos only, plus nextCursor).
   *   videos     -> { videos, nextCursor }
   *   creators   -> { creators, nextCursor }
   *   categories -> { categories }
   *   all        -> { videos, videosNextCursor, creators, categories }   (search screen)
   */

  search: async (
    query: string,
    limit: number,
    options: {
      cursor?: string;
      scope?: 'videos' | 'creators' | 'categories' | 'all';
      type?: 'LONG_FORM' | 'SHORT_FORM';
    } = {},
  ) => {
    try {
      const { cursor, scope = 'videos', type } = options;

      const searchVideos = async (take: number, videoCursor?: string) => {
        const rows = await prisma.video.findMany({
          where: {
            ...PUBLIC_FEED_WHERE,
            ...(type ? { type } : {}),
            title: { contains: query, mode: 'insensitive' },
          },
          include: {
            thumbnailAsset: true,
            creator: { include: { user: { select: { id: true, role: true } } } },
          },
          orderBy: [{ viewCount: 'desc' }, { id: 'desc' }],
          take: take + 1,
          ...(videoCursor ? { skip: 1, cursor: { id: videoCursor } } : {}),
        });
        const { items, nextCursor } = toPage(rows, take);
        return { videos: items, nextCursor };
      };

      const searchCreators = async (take: number, creatorCursor?: string) => {
        const rows = await prisma.creatorProfile.findMany({
          where: {
            status: 'ACTIVE',
            OR: [
              { channelName: { contains: query, mode: 'insensitive' } },
              {
                user: {
                  profile: {
                    is: { username: { contains: query, mode: 'insensitive' } },
                  },
                },
              },
              {
                user: {
                  profile: {
                    is: {
                      displayName: { contains: query, mode: 'insensitive' },
                    },
                  },
                },
              },
            ],
          },
          include: {
            user: { select: { id: true, role: true, profile: true } },
            _count: { select: { followers: true } },
          },
          orderBy: [{ followers: { _count: 'desc' } }, { id: 'desc' }],
          take: take + 1,
          ...(creatorCursor ? { skip: 1, cursor: { id: creatorCursor } } : {}),
        });
        const { items, nextCursor } = toPage(rows, take);
        return {
          creators: items.map((c) => ({
            creatorId: c.id,
            channelName: c.channelName,
            username: c.user.profile?.username ?? null,
            displayName: c.user.profile?.displayName ?? null,
            followerCount: c._count.followers,
          })),
          nextCursor,
        };
      };

      const searchCategories = () =>
        prisma.category.findMany({
          where: { name: { contains: query, mode: 'insensitive' } },
          orderBy: { name: 'asc' },
          take: 10,
        });

      if (scope === 'creators') return await searchCreators(limit, cursor);
      if (scope === 'categories')
        return { categories: await searchCategories() };
      if (scope === 'all') {
        const [v, c, categories] = await Promise.all([
          searchVideos(limit),
          searchCreators(5),
          searchCategories(),
        ]);
        return {
          videos: v.videos,
          videosNextCursor: v.nextCursor,
          creators: c.creators,
          categories,
        };
      }
      return await searchVideos(limit, cursor);
    } catch (error) {
      throw new ApiError(500, 'Failed to search', error);
    }
  },

  /** "Up next": same format, ranked same-category -> same-creator -> most viewed, de-duplicated. */
  getRelatedVideos: async (
    videoId: string,
    limit: number,
    viewerClerkUserId?: string,
  ) => {
    try {
      // getById enforces visibility: a viewer who can't see the source gets a 404.
      const source = await VideoService.getById(videoId, viewerClerkUserId);
      const base = {
        ...PUBLIC_FEED_WHERE,
        type: source.type,
        id: { not: source.id },
      };
      const include = {
        thumbnailAsset: true,
        creator: { include: { user: { select: { id: true, role: true } } } },
        category: true,
      } as const;
      const order: Prisma.VideoOrderByWithRelationInput[] = [
        { viewCount: 'desc' },
        { id: 'desc' },
      ];

      const sameCategory = source.categoryId
        ? await prisma.video.findMany({
            where: { ...base, categoryId: source.categoryId },
            include,
            orderBy: order,
            take: limit,
          })
        : [];
      const sameCreator =
        sameCategory.length < limit
          ? await prisma.video.findMany({
              where: { ...base, creatorId: source.creatorId },
              include,
              orderBy: order,
              take: limit,
            })
          : [];
      const popular =
        sameCategory.length + sameCreator.length < limit
          ? await prisma.video.findMany({
              where: base,
              include,
              orderBy: order,
              take: limit,
            })
          : [];

      return {
        videos: mergeUnique([sameCategory, sameCreator, popular], limit),
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to load related videos', error);
    }
  },

  /** Public channel page: a creator's PUBLIC, published videos, newest first, cursor-paginated. */
  getCreatorVideos: async (
    creatorId: string,
    limit: number,
    cursor?: string,
    type?: 'LONG_FORM' | 'SHORT_FORM',
  ) => {
    try {
      const creator = await prisma.creatorProfile.findUnique({
        where: { id: creatorId },
        select: { id: true, status: true },
      });
      if (!creator || creator.status !== 'ACTIVE')
        throw new ApiError(404, 'Creator not found');

      const rows = await prisma.video.findMany({
        where: { ...PUBLIC_FEED_WHERE, creatorId, ...(type ? { type } : {}) },
        include: {
          thumbnailAsset: true,
          creator: { include: { user: { select: { id: true, role: true } } } },
          category: true,
        },
        orderBy: FEED_ORDER_BY,
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      const { items, nextCursor } = toPage(rows, limit);
      return { videos: items, nextCursor };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to load creator videos', error);
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
        WHERE status IN ('READY', 'PUBLISHED')
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
          creator: { include: { user: { select: { id: true, role: true } }, profile: true } },
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
