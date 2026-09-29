
import type { Prisma, VideoStatus } from './../../generated/prisma/client';

export const LIVE_STATUSES: VideoStatus[] = ["READY", "PUBLISHED"];

export const PUBLIC_VIDEO_WHERE = {
  status: { in: LIVE_STATUSES },
  visibility: "PUBLIC" as const,
  deletedAt: null,
};

/** For a signed-in user's own lists: not deleted, and not someone else's PRIVATE video. */
export const visibleToUserWhere = (userId: string): Prisma.VideoWhereInput => ({
  deletedAt: null,
  OR: [{ visibility: { not: "PRIVATE" } }, { creator: { userId } }],
});

/** Rows fetched with take: limit + 1  ->  one page + nextCursor. */
export const toPage = <T extends { id: string }>(rows: T[], limit: number) => {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
};

/** Concatenate lists, dropping ids already seen, stopping at `limit` ("related videos"). */
export const mergeUnique = <T extends { id: string }>(lists: T[][], limit: number): T[] => {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
      if (out.length >= limit) return out;
    }
  }
  return out;
};

/** One point per UTC day, oldest first, gaps zero-filled (for charts). */
export const fillDailySeries = (rows: Array<{ day: Date; count: number }>, days: number, now = new Date()) => {
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const byDay = new Map(rows.map((r) => [key(r.day), r.count]));
  const out: Array<{ date: string; views: number }> = [];
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  for (let i = days - 1; i >= 0; i--) {
    const date = key(new Date(todayUtc - i * 86_400_000));
    out.push({ date, views: byDay.get(date) ?? 0 });
  }
  return out;
};