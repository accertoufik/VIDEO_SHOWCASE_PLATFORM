import { haptics } from '@/lib/haptics';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { Share } from 'react-native';
import {
  followCreator,
  likeVideo,
  saveVideo,
  shareVideo,
  unfollowCreator,
  unlikeVideo,
  unsaveVideo,
} from '@/api/social';
import { useApi } from '@/lib/auth/useApi';
import { queryKeys } from '@/lib/query/queryKeys';
import type { VideoDetail } from '@/types/video';
import { patchVideoCache, withCount, type VideoQueryData } from './videoCache';

/**
 * Optimistic toggle on the cached video: flip the UI now, roll back if the request fails (the global
 * mutation handler shows the error toast), then re-sync with the server either way.
 */
const useOptimisticVideoToggle = (
  videoId: string,
  request: (next: boolean) => Promise<unknown>,
  apply: (data: VideoQueryData, next: boolean) => VideoQueryData,
) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: request,
    onMutate: async (next: boolean) => {
      haptics.tap();
      await qc.cancelQueries({ queryKey: queryKeys.video(videoId) });
      const previous = qc.getQueryData<VideoQueryData>(
        queryKeys.video(videoId),
      );
      patchVideoCache(qc, videoId, (data) => apply(data, next));
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context?.previous)
        qc.setQueryData(queryKeys.video(videoId), context.previous);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.video(videoId) });
      // Liked / saved / following lists must reflect the change the next time they're opened.
      qc.invalidateQueries({ queryKey: ['library'] });
    },
  });
};

export const useToggleLike = (videoId: string) => {
  const api = useApi();
  return useOptimisticVideoToggle(
    videoId,
    (next) => (next ? likeVideo(api, videoId) : unlikeVideo(api, videoId)),
    (data, next) => ({
      video: {
        ...data.video,
        likeCount: withCount(data.video.likeCount, next ? 1 : -1),
      },
      viewer: { ...data.viewer!, isLiked: next },
    }),
  );
};

export const useToggleSave = (videoId: string) => {
  const api = useApi();
  return useOptimisticVideoToggle(
    videoId,
    (next) => (next ? saveVideo(api, videoId) : unsaveVideo(api, videoId)),
    (data, next) => ({
      video: data.video,
      viewer: { ...data.viewer!, isSaved: next },
    }),
  );
};

export const useToggleFollow = (videoId: string, creatorId: string) => {
  const api = useApi();
  return useOptimisticVideoToggle(
    videoId,
    (next) =>
      next ? followCreator(api, creatorId) : unfollowCreator(api, creatorId),
    (data, next) => ({
      video: {
        ...data.video,
        creator: {
          ...data.video.creator,
          followerCount: withCount(
            data.video.creator.followerCount,
            next ? 1 : -1,
          ),
        },
      },
      viewer: { ...data.viewer!, isFollowingCreator: next },
    }),
  );
};

/** Opens the system share sheet; if the user actually shared, bump the backend counter (no sign-in needed). */
export const useShare = (video: VideoDetail) => {
  const api = useApi();

  const bump = useMutation({
    mutationFn: () => shareVideo(api, video.id),
    meta: { silent: true },
  });

  return async () => {
    try {
      // The link uses the app's URL scheme (see app.json "scheme"). There is no public web domain yet.
      const url = Linking.createURL(`/video/${video.id}`);
      const result = await Share.share({ message: `${video.title}\n${url}` });
      if (result.action === Share.sharedAction) bump.mutate();
    } catch {
      // user dismissed or the platform refused: nothing to do
    }
  };
};
