import { useMutation, useQueryClient } from '@tanstack/react-query';
import { publishVideo } from '@/api/creatorVideos';
import { MY_VIDEOS_KEY } from '@/hooks/queries/useMyVideos';
import { useApi } from '@/lib/auth/useApi';
import { queryKeys } from '@/lib/query/queryKeys';
import type { MyVideo, Visibility } from '@/types/creatorVideo';

/** Not optimistic on purpose: publishing Public notifies followers, so we wait for the server. */
export const usePublishVideo = () => {
  const api = useApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      video,
      visibility,
    }: {
      video: MyVideo;
      visibility: Visibility;
    }) => publishVideo(api, video.id, visibility),
    onSuccess: (_data, { video }) => {
      void qc.invalidateQueries({ queryKey: MY_VIDEOS_KEY });
      void qc.invalidateQueries({ queryKey: queryKeys.video(video.id) });
    },
    // The status may have moved on since the list loaded (e.g. processing failed): refresh it.
    onError: () => {
      void qc.invalidateQueries({ queryKey: MY_VIDEOS_KEY });
    },
  });
};
