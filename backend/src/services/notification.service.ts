import type { Prisma } from './../../generated/prisma/client';
import { prisma } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { PushService } from './push.service';
import { signImage } from '../lib/signImage';

/* Every notification-creating call below is deliberately "fire and forget"
 * from the caller's point of view — a failed notification write should
 * never break the action that triggered it (liking a video still has to
 * succeed even if, say, the DB hiccups on the notification insert). So
 * each helper swallows its own errors internally and just logs them,
 * rather than throwing back into follow/like/comment/etc.
 * **/



interface CreateNotificationInput {
  recipientId: string;
  actorId: string;
    type: | 'NEW_FOLLOWER' | 'NEW_VIDEO_FROM_FOLLOWED' | 'COMMENT_REPLY' | 'VIDEO_LIKED' | 'VIDEO_COMMENTED' | 'SYSTEM';
    title: string;
    body: string;
    videoId: string | null;
    creatorId: string | null;
    payload: Record<string, unknown> | null;
}

export const NotificationService = {
    /** Internal helper - never let a notifications failure bubble up and break the caller's real logic. */
    create: async (input: CreateNotificationInput) => {
        try {
            // never  notify someone someone about their own actions (e.g. liking their own video, following themselves, etc.)
            if (input.actorId === input.recipientId) {
                return;
            }
            await prisma.notification.create({
                data: {
                    recipientId: input.recipientId,
                    actorId: input.actorId,
                    type: input.type,
                    title: input.title,
                    body: input.body,
                    videoId: input.videoId,
                    creatorId: input.creatorId,
                    payload: input.payload as Prisma.InputJsonValue | undefined,
                },
            });
            void PushService.sendToUsers([input.recipientId], {
                title: input.title,
                body: input.body,
                data: {
                    type: input.type,
                    videoId: input.videoId,
                    creatorId: input.creatorId,
                    ...input.payload,
                },
            });
        } catch (error) {
            console.error('Failed to create notification:', error);
        }
    },

    /**
     * Fan-out helper for "a followed creator published a new video" — one
     * notification row per follower. Used by the worker once a video flips
     * to READY. Kept as a single createMany for efficiency instead of N
     * separate inserts.
     */
    notifyFollowersOfNewVideo: async (creatorId: string, videoId: string, title: string) => {
        try {
      
            const creatorProfile = await prisma.creatorProfile.findUnique({
                where: { id: creatorId },
                include: { user: { include: { profile: true } } }
            });
            if (!creatorProfile) return;

            const followers = await prisma.follow.findMany({
                where: { creatorId },
                select: { followerId: true }
            });
            if (followers.length === 0) return;

            const channelName = creatorProfile.user.profile?.displayName || creatorProfile.channelName || 'Unknown Creator';

            await prisma.notification.createMany({
                data: followers.map(f => ({
                    recipientId: f.followerId,
                    actorId: creatorProfile.userId,
                    type: 'NEW_VIDEO_FROM_FOLLOWED' as const,
                    title: `${channelName} just posted a new video`,
                    body: title, videoId, creatorId,
                })),
                skipDuplicates: true,
            });
            void PushService.sendToUsers(followers.map(f => f.followerId), {
                title: `${channelName} just posted a new video`,
                body: title,
                data: {
                    type: 'NEW_VIDEO_FROM_FOLLOWED',
                    videoId,
                    creatorId,
                },
            });
        } catch (error) {
            console.error('Failed to notify followers of new video:', error);
        }
    },

    listMine: async (clerkUserId: string, limit: number, cursor: string | null) => { 
        try {
            const user = await prisma.user.findUnique({
                where: { clerkUserId },
                select: { id: true }
            });
            if (!user) {
                throw new ApiError(404, "User not found");
            }

            const rows = await prisma.notification.findMany({
                where: { recipientId: user.id },
                include: {
                    actor: { include: { profile: { include: { avatarAsset: true } } } },
                    video: { select: { id: true, title: true, thumbnailAsset: { select: { blobPath: true } } } },
                },
                orderBy: { createdAt: 'desc' },
                take: limit + 1,
                cursor: cursor ? { id: cursor } : undefined,
                skip: cursor ? 1 : 0,
            });

            const hasMore = rows.length > limit;
            const page = hasMore ? rows.slice(0, limit) : rows;
            const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

            // Explicit pick: no user rows, emails, Clerk ids or blob paths leave the server.
            const notifications = await Promise.all(
                page.map(async (n) => {
                    const profile = n.actor?.profile;
                    const [avatarUrl, thumbnailUrl] = await Promise.all([
                        signImage(profile?.avatarAsset?.blobPath),
                        signImage(n.video?.thumbnailAsset?.blobPath),
                    ]);
                    return {
                        id: n.id,
                        type: n.type,
                        title: n.title,
                        body: n.body,
                        readAt: n.readAt,
                        createdAt: n.createdAt,
                        videoId: n.videoId,
                        creatorId: n.creatorId,
                        actor: profile
                            ? { displayName: profile.displayName, username: profile.username, avatarUrl }
                            : null,
                        video: n.video ? { id: n.video.id, title: n.video.title, thumbnailUrl } : null,
                    };
                }),
            );

            const unreadCount = await prisma.notification.count({
                where: { recipientId: user.id, readAt: null },
            });

            // `UnreadCount` (capital U) is what this endpoint used to send; keep it so existing callers don't break.
            return { notifications, nextCursor, unreadCount, UnreadCount: unreadCount };
        }catch (error) {
            if (error instanceof ApiError) throw error;
            console.error('Failed to list notifications:', error);
            throw new ApiError(500, "Failed to list notifications");
        }
    },

    markRead: async (clerkUserId: string, notificationId: string) => {
        try {
            const user = await prisma.user.findUnique({
                where: { clerkUserId },
                select: { id: true }
            });
            if (!user) {
                throw new ApiError(404, "User not found");
            }
            
            const notification = await prisma.notification.findUnique({
                where: { id: notificationId },
                select: { recipientId: true, readAt: true }
            });
            if (!notification) {
                throw new ApiError(404, "Notification not found");
            }

            if (notification.recipientId !== user.id) {
                throw new ApiError(403, "Forbidden");
            }

            const update = await prisma.notification.update({
                where: { id: notificationId },
                data: { readAt: notification.readAt || new Date() }
            });
            return update;
        } catch (error) {
            if (error instanceof ApiError) throw error;
            console.error('Failed to mark notification as read:', error);
            throw new ApiError(500, "Failed to mark notification as read");
        }
    },

    /** Deletes every notification the caller has received. */
    clearAll: async (clerkUserId: string) => {
        try {
            const user = await prisma.user.findUnique({
                where: { clerkUserId },
                select: { id: true }
            });
            if (!user) {
                throw new ApiError(404, "User not found");
            }
            const result = await prisma.notification.deleteMany({ where: { recipientId: user.id } });
            return { deletedCount: result.count };
        } catch (error) {
            if (error instanceof ApiError) throw error;
            console.error('Failed to clear notifications:', error);
            throw new ApiError(500, "Failed to clear notifications");
        }
    },

    markAllRead: async (clerkUserId: string) => {
        try {
            const user = await prisma.user.findUnique({
                where: { clerkUserId },
                select: { id: true }
            });
            if (!user) {
                throw new ApiError(404, "User not found");
            }

            const result = await prisma.notification.updateMany({
                where: { recipientId: user.id, readAt: null },
                data: { readAt: new Date() }
            });
            return { updateCount: result.count };
        } catch (error) {
            if (error instanceof ApiError) throw error;
            console.error('Failed to mark all notifications as read:', error);
            throw new ApiError(500, "Failed to mark all notifications as read");
        }
    },
}