import { prisma } from '../config/db';

export const ViewerService = {
  getVideoState: async (
    clerkUserId: string | undefined,
    video: { id: string; creatorId: string },
  ) => {
    if (!clerkUserId) return null;

    const user = await prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true, creatorProfile: { select: { id: true } } },
    });
    if (!user) return null;

    const [like, saved, watchLater, follow, progress] = await Promise.all([
      prisma.videoLike.findUnique({
        where: { userId_videoId: { userId: user.id, videoId: video.id } },
        select: { id: true },
      }),
      prisma.savedVideo.findFirst({
        where: { userId: user.id, videoId: video.id },
        select: { id: true },
      }),
      prisma.watchLater.findFirst({
        where: { userId: user.id, videoId: video.id },
        select: { id: true },
      }),
      prisma.follow.findUnique({
        where: {
          followerId_creatorId: {
            followerId: user.id,
            creatorId: video.creatorId,
          },
        },
        select: { id: true },
      }),
      prisma.watchProgress.findUnique({
        where: { userId_videoId: { userId: user.id, videoId: video.id } },
        select: { positionMs: true, completionPercent: true, completed: true },
      }),
    ]);

    return {
      isLiked: like != null,
      isSaved: saved != null,
      isWatchLater: watchLater != null,
      isFollowingCreator: follow != null,
      isOwner: user.creatorProfile?.id === video.creatorId,
      progress: progress
        ? {
            positionMs: Number(progress.positionMs),
            completionPercent: Number(progress.completionPercent),
            completed: progress.completed,
          }
        : null,
    };
  },

  /** followerCount is public; isFollowing / isOwnChannel only exist for signed-in callers. */
  getCreatorState: async (
    clerkUserId: string | undefined,
    creatorId: string,
  ) => {
    const followerCount = await prisma.follow.count({ where: { creatorId } });
    if (!clerkUserId) return { followerCount, viewer: null };

    const user = await prisma.user.findUnique({
      where: { clerkUserId },
      select: { id: true, creatorProfile: { select: { id: true } } },
    });
    if (!user) return { followerCount, viewer: null };

    const follow = await prisma.follow.findUnique({
      where: { followerId_creatorId: { followerId: user.id, creatorId } },
      select: { id: true },
    });
    return {
      followerCount,
      viewer: {
        isFollowing: follow != null,
        isOwnChannel: user.creatorProfile?.id === creatorId,
      },
    };
  },
};
