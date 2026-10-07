import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../config/db';
import { visibleToUserWhere, toPage, LIVE_STATUSES, VIDEO_CARD_INCLUDE } from '../lib/videoWhere';
import { presentVideoCards } from '../lib/videoCard';
import { ApiError } from '../middleware/errorHandler';
import { AzureStorageService } from './azure-storage.service';

const getUserId = async (clerkUserId: string) => {
  const user = await prisma.user.findUnique({
    where: { clerkUserId },
    select: { id: true },
  });
  if (!user) throw new ApiError(404, 'User not found');
  return user.id;
};

const serializeProgress = (p: {
  positionMs: bigint;
  completionPercent: Prisma.Decimal;
  completed: boolean;
  lastWatchedAt: Date;
}) => ({
  positionMs: Number(p.positionMs),
  completionPercent: Number(p.completionPercent),
  completed: p.completed,
  lastWatchedAt: p.lastWatchedAt,
});

export const LibraryService = {
  /**
   * Watch history, newest first, ONE entry per video (the table logs a row per
   * play). Cursor = id of the last history row; compared inside Postgres against
   * that row's exact timestamp, so no ms-vs-µs rounding drops/duplicates.
   */
  listHistory: async (clerkUserId: string, limit: number, cursor?: string) => {
    try {
      const userId = await getUserId(clerkUserId);

      const cursorSql = cursor
        ? Prisma.sql`AND ("watchedAt", id) < (SELECT "watchedAt", id FROM watch_history WHERE id = ${cursor} AND "userId" = ${userId})`
        : Prisma.empty;

      const rows = await prisma.$queryRaw<
        Array<{ id: string; videoId: string; watchedAt: Date }>
      >(Prisma.sql`
        SELECT id, "videoId", "watchedAt" FROM (
          SELECT DISTINCT ON (h."videoId") h.id, h."videoId", h."watchedAt"
          FROM watch_history h
          JOIN videos v ON v.id = h."videoId"
          WHERE h."userId" = ${userId}
            AND v."deletedAt" IS NULL
            AND v.visibility <> 'PRIVATE'
            AND v.status IN ('READY', 'PUBLISHED')
          ORDER BY h."videoId", h."watchedAt" DESC, h.id DESC
        ) latest
        WHERE TRUE ${cursorSql}
        ORDER BY "watchedAt" DESC, id DESC
        LIMIT ${limit + 1}
      `);

      const { items, nextCursor } = toPage(rows, limit);
      if (items.length === 0) return { items: [], nextCursor: null };

      const videoIds = items.map((r) => r.videoId);
      const [videos, progress] = await Promise.all([
        prisma.video
          .findMany({ where: { id: { in: videoIds } }, include: VIDEO_CARD_INCLUDE })
          .then((rows) => presentVideoCards(rows)),
        prisma.watchProgress.findMany({
          where: { userId, videoId: { in: videoIds } },
        }),
      ]);
      const videoById = new Map(videos.map((v) => [v.id, v]));
      const progressById = new Map(progress.map((p) => [p.videoId, p]));

      return {
        items: items
          .map((r) => {
            const video = videoById.get(r.videoId);
            if (!video) return null;
            const p = progressById.get(r.videoId);
            return {
              historyId: r.id,
              watchedAt: r.watchedAt,
              video,
              progress: p ? serializeProgress(p) : null,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x != null),
        nextCursor,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to load watch history', error);
    }
  },

  /** Started-but-unfinished videos, most recently watched first. Cursor = WatchProgress id. */
  listContinueWatching: async (
    clerkUserId: string,
    limit: number,
    cursor?: string,
  ) => {
    try {
      const userId = await getUserId(clerkUserId);
      const rows = await prisma.watchProgress.findMany({
        where: {
          userId,
          completed: false,
          positionMs: { gt: 0 },
          video: {
            ...visibleToUserWhere(userId),
            status: { in: LIVE_STATUSES },
          },
        },
        include: { video: { include: VIDEO_CARD_INCLUDE } },
        orderBy: [{ lastWatchedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      const { items, nextCursor } = toPage(rows, limit);
      const videos = await presentVideoCards(items.map((p) => p.video));
      return {
        items: items.map((p, i) => ({
          progressId: p.id,
          video: videos[i],
          progress: serializeProgress(p),
        })),
        nextCursor,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to load continue watching', error);
    }
  },

  /** Drops the play log AND the resume point, so it also leaves Continue Watching. */
  removeFromHistory: async (clerkUserId: string, videoId: string) => {
    try {
      const userId = await getUserId(clerkUserId);
      const [history, progress] = await prisma.$transaction([
        prisma.watchHistory.deleteMany({ where: { userId, videoId } }),
        prisma.watchProgress.deleteMany({ where: { userId, videoId } }),
      ]);
      return { removed: history.count + progress.count > 0 };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to remove from history', error);
    }
  },

  clearHistory: async (clerkUserId: string) => {
    try {
      const userId = await getUserId(clerkUserId);
      const [history] = await prisma.$transaction([
        prisma.watchHistory.deleteMany({ where: { userId } }),
        prisma.watchProgress.deleteMany({ where: { userId } }),
      ]);
      return { cleared: true, removedCount: history.count };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to clear history', error);
    }
  },

  /** Creators the caller follows, most recently followed first. Cursor = Follow id. */
  listFollowing: async (
    clerkUserId: string,
    limit: number,
    cursor?: string,
  ) => {
    try {
      const userId = await getUserId(clerkUserId);
      const rows = await prisma.follow.findMany({
        where: { followerId: userId, creator: { status: 'ACTIVE' } },
        include: {
          creator: {
            include: {
              user: {
                include: { profile: { include: { avatarAsset: true } } },
              },
              _count: { select: { followers: true } },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      const { items, nextCursor } = toPage(rows, limit);

      const creators = await Promise.all(
        items.map(async (f) => {
          const profile = f.creator.user.profile;
          const avatarPath = profile?.avatarAsset?.blobPath;
          let avatarUrl: string | null = null;
          if (avatarPath) {
            try {
              avatarUrl = await AzureStorageService.generateReadSasUrl(
                'thumbnails',
                avatarPath,
                60,
              );
            } catch {
              // One unsignable avatar must not break the whole list.
            }
          }
          return {
            followId: f.id,
            followedAt: f.createdAt,
            creatorId: f.creator.id,
            channelName: f.creator.channelName,
            username: profile?.username ?? null,
            displayName: profile?.displayName ?? null,
            avatarUrl,
            followerCount: f.creator._count.followers,
          };
        }),
      );
      return { creators, nextCursor };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to load followed creators', error);
    }
  },
};