import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/queryKeys';
import type { VideoDetail, ViewerState } from '@/types/video';

export type VideoQueryData = { video: VideoDetail; viewer: ViewerState | null };

const emptyViewer: ViewerState = {
  isLiked: false,
  isSaved: false,
  isWatchLater: false,
  isFollowingCreator: false,
  isOwner: false,
  progress: null,
};

/** Apply a change to the cached video + viewer state, so buttons flip instantly. */
export const patchVideoCache = (
  qc: QueryClient,
  videoId: string,
  apply: (data: VideoQueryData) => VideoQueryData,
) =>
  qc.setQueryData<VideoQueryData>(queryKeys.video(videoId), (old) =>
    old ? apply({ ...old, viewer: old.viewer ?? emptyViewer }) : old,
  );

export const withCount = (value: number, delta: number) =>
  Math.max(0, value + delta);
