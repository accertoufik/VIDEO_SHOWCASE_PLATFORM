import type { Prisma } from './../../generated/prisma/client';
import { prisma } from "../config/db";
import { ApiError } from "../middleware/errorHandler";

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

            const notifications = await prisma.notification.findMany({
                where: { recipientId: user.id },
                include: {
                    actor: { include: { profile: true } },
                    video: { select: { id: true, title: true, thumbnailAsset: true } },
                },
                orderBy: { createdAt: 'desc' },
                take: limit + 1,
                cursor: cursor ? { id: cursor } : undefined,
                skip: cursor ? 1 : 0,
            });

            const hasMore = notifications.length > limit;
            const page = hasMore ? notifications.slice(0, limit) : notifications;
            const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

            const UnreadCount = await prisma.notification.count({
                where: { recipientId: user.id, readAt: null }
            });

            return { notifications: page, nextCursor, UnreadCount };
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