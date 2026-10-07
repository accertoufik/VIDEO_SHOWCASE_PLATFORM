import { useIsFocused } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { listMyVideos } from '@/api/creatorVideos';
import { useAppActive } from '@/hooks/useAppActive';
import { useApi } from '@/lib/auth/useApi';
import { isHdPending } from '@/lib/hdPolling';
import type { VideoStatus } from '@/types/creatorVideo';

/** Prefix shared with the upload hook's invalidation. */
export const MY_VIDEOS_KEY = ['studio', 'videos'] as const;

const PROCESSING_POLL_MS = 5_000;
const HD_POLL_MS = 15_000;
// The worker is busy with these. UPLOADING is excluded: only this device changes it.
const IN_FLIGHT: VideoStatus[] = ['UPLOADED', 'PROCESSING'];

/** The creator's own videos. Refetches while anything is processing or waiting on HD, but only while the screen is visible and the app is in the foreground. */
export const useMyVideos = () => {
  const api = useApi();
  const focused = useIsFocused();
  const appActive = useAppActive();

  return useQuery({
    queryKey: MY_VIDEOS_KEY,
    queryFn: ({ signal }) => listMyVideos(api, signal),
    refetchInterval: (query) => {
      if (!focused || !appActive) return false;
      const list = query.state.data ?? [];
      if (list.some((v) => IN_FLIGHT.includes(v.status)))
        return PROCESSING_POLL_MS;
      if (list.some(isHdPending)) return HD_POLL_MS;
      return false;
    },
  });
};
