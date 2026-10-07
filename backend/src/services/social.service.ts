import { prisma } from '../config/db';
import { ApiError } from '../middleware/errorHandler';
import { NotificationService } from './notification.service';
import { AzureStorageService } from './azure-storage.service';
import { softDeleteCommentTree } from './comment-ops';
import { toPage, visibleToUserWhere, VIDEO_CARD_INCLUDE } from '../lib/videoWhere';
import { presentVideoCards } from '../lib/videoCard';

/**
 * Comments come back with the commenter's raw avatarAsset row (container +
 * blobPath), but that blob isn't publicly readable — same as every other
 * asset in this app. This turns it into a short-lived signed URL the
 * frontend can drop straight into an <img src>, matching the pattern
 * already used for downloads/streaming/thumbnails elsewhere.
 *
 * Mutates each comment (and each reply) in place to add `avatarUrl` right
 * next to the raw asset, rather than replacing the raw fields — callers
 * that don't care about the URL still get the same shape as before.
 */
const attachAvatarUrls = async <
  T extends { user: { profile: { avatarAsset: { blobPath: string } | null } | null } },
>(
  comments: Array<T & { replies?: T[] }>
) => {
  const blobPaths = new Set<string>();
  for (const comment of comments) {
    const path = comment.user.profile?.avatarAsset?.blobPath;
    if (path) blobPaths.add(path);
    for (const reply of comment.replies ?? []) {
      const replyPath = reply.user.profile?.avatarAsset?.blobPath;
      if (replyPath) blobPaths.add(replyPath);
    }
  }

  const urlByPath = new Map<string, string>();
  await Promise.all(
    Array.from(blobPaths).map(async (path) => {
      try {
        const url = await AzureStorageService.generateReadSasUrl("thumbnails", path, 60);
        urlByPath.set(path, url);
      } catch {
        // A signing failure for one avatar shouldn't break the whole comment
        // list — that commenter's avatarUrl just comes back null and the
        // frontend falls back to a placeholder.
      }
    })
  );

  const withAvatarUrl = (item: T) => {
    const path = item.user.profile?.avatarAsset?.blobPath;
    return { ...item, user: { ...item.user, avatarUrl: path ? urlByPath.get(path) ?? null : null } };
  };

  return comments.map((comment) => ({
    ...withAvatarUrl(comment),
    replies: (comment.replies ?? []).map(withAvatarUrl),
  }));
};

type CommentRow = {
  id: string;
  videoId: string;
  userId: string;
  parentCommentId: string | null;
  body: string;
  createdAt: Date;
  user: { avatarUrl?: string | null; profile: { username: string; displayName: string } | null };
  replies?: CommentRow[];
};

/** Public shape of a comment: just the author's display fields and whether the caller wrote it. No user row. */
const presentComment = (c: CommentRow, viewerUserId?: string): Record<string, unknown> => ({
  id: c.id,
  videoId: c.videoId,
  parentCommentId: c.parentCommentId,
  body: c.body,
  createdAt: c.createdAt,
  isMine: viewerUserId != null && c.userId === viewerUserId,
  author: {
    username: c.user.profile?.username ?? null,
    displayName: c.user.profile?.displayName ?? 'User',
    avatarUrl: c.user.avatarUrl ?? null,
  },
  replies: (c.replies ?? []).map((reply) => presentComment(reply, viewerUserId)),
});

const assertInteractable = (
  video: { deletedAt: Date | null; visibility: string; creator?: { userId: string } | null },
  userId: string,
) => {
  const isOwner = video.creator?.userId === userId;
  if (video.deletedAt || (video.visibility === 'PRIVATE' && !isOwner)) {
    throw new ApiError(404, 'Video not found');
  }
};

const getUserOrThrow = async (ClerkUserId: string) => {
  const user = await prisma.user.findUnique({
    where: { clerkUserId: ClerkUserId },
  });
  if (!user) throw new ApiError(404, 'User not found');
  return user;
};

export const SocialService = {
  /** follow a creator . Idempotent creation is NOT assumed — a duplicate follow is a 409.*/
  followCreator: async (ClerkUserId: string, creatorId: string) => {
    try {
      const user = await getUserOrThrow(ClerkUserId);

      const CreatorProfile = await prisma.creatorProfile.findUnique({
        where: { id: creatorId },
      });
      if (!CreatorProfile) throw new ApiError(404, 'Creator not found');
      if (user.id === CreatorProfile.userId)
        throw new ApiError(400, 'You cannot follow yourself');

      try {
        await prisma.follow.create({
          data: {
            followerId: user.id,
            creatorId: creatorId,
          },
        });
      } catch (error: any) {
        if (error.code === 'P2002') {
          throw new ApiError(409, 'You are already following this creator');
        }
        throw error;
      }

      // Fire-and-forget: the follow is already saved, and the notification must not make the app wait for it.
      void NotificationService.create({
        recipientId: CreatorProfile.userId,
        actorId: user.id,
        type: 'NEW_FOLLOWER',
        title: 'You have a new follower',
        body: 'Someone started following you',
        videoId: null,
        creatorId: creatorId,
        payload: null,
      });

      return { following: true };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to follow creator', error);
    }
  },

  /** Unfollow — safe to call even if not currently following (no error either way). */

  unfollowCreator: async (ClerkUserId: string, creatorId: string) => {
    try {
      const user = await getUserOrThrow(ClerkUserId);
      await prisma.follow.deleteMany({
        where: {
          followerId: user.id,
          creatorId: creatorId,
        },
      });
      return { following: false };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to unfollow creator', error);
    }
  },

  //like a video
  likeVideo: async (ClerkUserId: string, videoId: string) => {
    try {
      const user = await getUserOrThrow(ClerkUserId);
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: { creator: true },
      });
      if (!video) throw new ApiError(404, 'Video not found');
      assertInteractable(video, user.id);

      try {
        await prisma.$transaction([
          prisma.videoLike.create({
            data: {
              userId: user.id,
              videoId: videoId,
            },
          }),
          prisma.video.update({
            where: { id: videoId },
            data: { likeCount: { increment: 1 } },
          }),
        ]);
      } catch (error: any) {
        if (error.code === 'P2002') {
          throw new ApiError(409, 'You have already liked this video');
        }
        throw error;
      }

      await NotificationService.create({
        recipientId: video.creator.userId,
        actorId: user.id,
        type: 'VIDEO_LIKED',
        title: 'Someone liked your video',
        body: `Your video "${video.title}" got a new like`,
        videoId: video.id,
        creatorId: video.creatorId,
        payload: null,
      });

      return { liked: true };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to like video', error);
    }
  },

  //unlike a video
  unlikeVideo: async (ClerkUserId: string, videoId: string) => {
    try {
      const user = await getUserOrThrow(ClerkUserId);
      const existing = await prisma.videoLike.findUnique({
        where: { userId_videoId: { userId: user.id, videoId: videoId } },
      });
      if (!existing) {
        return { liked: false };
      }

      await prisma.$transaction([
        prisma.videoLike.delete({
          where: {
            id: existing.id,
          },
        }),
        prisma.video.update({
          where: { id: videoId },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);
      return { liked: false };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to unlike video', error);
    }
  },

  //add a comment to a video
  addComment: async (
    ClerkUserId: string,
    videoId: string,
    content: string,
    parentCommentId: string | null,
  ) => {
    try {
      const user = await getUserOrThrow(ClerkUserId);
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: { creator: true },
      });
      if (!video) throw new ApiError(404, 'Video not found');
      assertInteractable(video, user.id);

      let parentComment = null;
      if (parentCommentId) {
        parentComment = await prisma.comment.findUnique({
          where: { id: parentCommentId },
        });
        if (!parentComment || parentComment.videoId !== videoId || parentComment.deletedAt)
          throw new ApiError(404, 'Parent comment not found');
      }
      const [comment] = await prisma.$transaction([
        prisma.comment.create({
          data: {
            videoId: videoId,
            userId: user.id,
            body: content,
            parentCommentId: parentComment ? (parentComment.parentCommentId ?? parentComment.id) : null,
          },
        }),
        prisma.video.update({
          where: { id: videoId },
          data: { commentCount: { increment: 1 } },
        }),
      ]);

      const commentWithUser = await prisma.comment.findUniqueOrThrow({
        where: { id: comment.id },
        include: { user: { include: { profile: { include: { avatarAsset: true } } } } },
      });

      if (!commentWithUser) throw new ApiError(500, 'Failed to retrieve comment after creation');

      const commentsWithAvatarUrl = await attachAvatarUrls([commentWithUser]);
      const commentWithAvatarUrl = commentsWithAvatarUrl[0];

      // Send notification to the video creator or parent comment author

      if (parentComment) {
        await NotificationService.create({
          recipientId: parentComment.userId,
          actorId: user.id,
          type: 'COMMENT_REPLY',
          title: 'Someone replied to your comment',
          body: content,
          videoId: video.id,
          creatorId: video.creatorId,
          payload: null,
        });
      } else {
        await NotificationService.create({
          recipientId: video.creator.userId,
          actorId: user.id,
          type: 'VIDEO_COMMENTED',
          title: 'New comment on your video',
          body: content,
          videoId: video.id,
          creatorId: video.creatorId,
          payload: null,
        });
      }

      return presentComment(commentWithAvatarUrl as unknown as CommentRow, user.id);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to add comment', error);
    }
  },

  //list comments for a video
  listComments: async (videoId: string, viewerClerkUserId?: string) => {
    try {
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: { creator: { select: { userId: true } } },
      });
      if (!video) throw new ApiError(404, 'Video not found');
      const viewer = viewerClerkUserId
        ? await prisma.user.findUnique({ where: { clerkUserId: viewerClerkUserId }, select: { id: true } })
        : null;
      assertInteractable(video, viewer?.id ?? '');

      const commentUserInclude = {
        user: { include: { profile: { include: { avatarAsset: true } } } },
      };
      const comments = await prisma.comment.findMany({
        where: { videoId: videoId, deletedAt: null, parentCommentId: null },
        include: {
          ...commentUserInclude,
          replies: {
            where: { deletedAt: null },
            include: commentUserInclude,
            orderBy: { createdAt: 'asc' }, // replies read oldest-first, like a conversation
          },
        },
        orderBy: { createdAt: 'desc' },
      });
      const withAvatars = await attachAvatarUrls(comments);
      return (withAvatars as unknown as CommentRow[]).map((comment) =>
        presentComment(comment, viewer?.id),
      );
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to list comments', error);
    }
  },

  /** soft-deletes a comment-only the comment's own author may delete it */
  deleteComment: async (ClerkUserId: string, commentId: string) => {
    try {
      const user = await getUserOrThrow(ClerkUserId);
      const comment = await prisma.comment.findUnique({
        where: { id: commentId },
      });
      if (!comment || comment.deletedAt)
        throw new ApiError(404, 'Comment not found');
      if (comment.userId !== user.id)
        throw new ApiError(403, 'You can only delete your own comments');

      await softDeleteCommentTree(comment);
      return { deleted: true };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to delete comment', error);
    }
  },

  //save a video to the user's watchlist
  saveToWatchlist: async (ClerkUserId: string, videoId: string) => {
    try {
      const user = await getUserOrThrow(ClerkUserId);
      const video = await prisma.video.findUnique({
        where: { id: videoId },
        include: { creator: true },
      });
      if (!video) throw new ApiError(404, 'Video not found');
      assertInteractable(video, user.id);

      try {
        await prisma.savedVideo.create({
          data: {
            userId: user.id,
            videoId: videoId,
          },
        });
      } catch (error: any) {
        if (error.code === 'P2002') {
          throw new ApiError(409, 'You have already saved this video');
        }
        throw error;
      }
      return { saved: true };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to save video', error);
    }
  },

  //remove a video from the user's watchlist
  removeFromWatchlist: async (ClerkUserId: string, videoId: string) => {
    try {
      const user = await getUserOrThrow(ClerkUserId);
      await prisma.savedVideo.deleteMany({
        where: {
          userId: user.id,
          videoId: videoId,
        },
      });
      return { saved: false };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(500, 'Failed to remove video from watchlist', error);
    }
  },

  //get the user's watchlist (paginated)
  getWatchlist: async (ClerkUserId: string, limit = 50, cursor?: string) => {
    try {
      const user = await getUserOrThrow(ClerkUserId);
      const rows = await prisma.savedVideo.findMany({
        where: { userId: user.id, video: visibleToUserWhere(user.id) },
        include: { video: { include: VIDEO_CARD_INCLUDE } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      const { items, nextCursor } = toPage(rows, limit);
      const videos = await presentVideoCards(items.map((row) => row.video));
      return {
        saved: items.map((row, i) => ({ id: row.id, createdAt: row.createdAt, video: videos[i] })),
        nextCursor,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to get watchlist', error);
    }
  },

  /** Every video the caller has liked, newest like first (paginated). */
  listLikedVideos: async (ClerkUserId: string, limit = 50, cursor?: string) => {
    try {
      const user = await getUserOrThrow(ClerkUserId);
      const rows = await prisma.videoLike.findMany({
        where: { userId: user.id, video: visibleToUserWhere(user.id) },
        include: { video: { include: VIDEO_CARD_INCLUDE } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      const { items, nextCursor } = toPage(rows, limit);
      const videos = await presentVideoCards(items.map((row) => row.video));
      return {
        liked: items.map((row, i) => ({ id: row.id, createdAt: row.createdAt, video: videos[i] })),
        nextCursor,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, 'Failed to get liked videos', error);
    }
  },
};
