import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { clearHistory, removeFromHistory } from '@/api/library';
import { useApi } from '@/lib/auth/useApi';
import { queryKeys } from '@/lib/query/queryKeys';
import type { LibraryPage, LibraryVideo } from '@/types/library';
import { LIBRARY_KEY } from '../queries/useLibrary';

type VideoPages = InfiniteData<LibraryPage<LibraryVideo>>;

const withoutVideo = (
  data: VideoPages | undefined,
  videoId: string,
): VideoPages | undefined =>
  data && {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.video.id !== videoId),
    })),
  };

/** Removing from history also drops the resume point, so it disappears from Continue Watching too. */
export const useRemoveFromHistory = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (videoId: string) => removeFromHistory(api, videoId),
    onMutate: async (videoId) => {
      await qc.cancelQueries({ queryKey: LIBRARY_KEY });
      const snapshots = qc.getQueriesData({ queryKey: LIBRARY_KEY });
      for (const name of ['history', 'continue']) {
        qc.setQueriesData<VideoPages>(
          { queryKey: [...LIBRARY_KEY, name] },
          (old) => withoutVideo(old, videoId),
        );
      }
      return { snapshots };
    },
    onError: (_error, _videoId, context) =>
      context?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data)),
    onSettled: (_data, _error, videoId) => {
      qc.invalidateQueries({ queryKey: LIBRARY_KEY });
      qc.invalidateQueries({ queryKey: queryKeys.video(videoId) }); // its resume position is gone
    },
  });
};

export const useClearHistory = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => clearHistory(api),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIBRARY_KEY });
      qc.invalidateQueries({ queryKey: ['video'] });
    },
  });
};
