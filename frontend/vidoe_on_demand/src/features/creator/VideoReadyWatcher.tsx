import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { listMyVideos } from '@/api/creatorVideos';
import { MY_VIDEOS_KEY } from '@/hooks/queries/useMyVideos';
import { useMe } from '@/hooks/queries/useMe';
import { NOTIFICATIONS_KEY } from '@/hooks/queries/useNotifications';
import { useAppActive } from '@/hooks/useAppActive';
import { isHdPending } from '@/lib/hdPolling';
import { useApi } from '@/lib/auth/useApi';
import { toast } from '@/lib/toast';
import type { VideoStatus } from '@/types/creatorVideo';

const POLL_MS = 8_000;
const HD_POLL_MS = 15_000; // HD takes minutes; no need to ask as often as while the video itself is processing
// Statuses a video passes through before it can be published.
const BEFORE_READY: VideoStatus[] = ['UPLOADING', 'UPLOADED', 'PROCESSING'];
// A video stuck in a processing state for hours (a failed job) must not keep the app polling forever.
const GIVE_UP_AFTER_MS = 2 * 60 * 60_000;
const isInFlight = (v: { status: VideoStatus; createdAt: string }) =>
  BEFORE_READY.includes(v.status) &&
  Date.now() - Date.parse(v.createdAt) < GIVE_UP_AFTER_MS;

/**
 * Renders nothing. While one of the creator's videos is still uploading or processing, keeps checking in the
 * background (on ANY screen, not just Content) and tells the creator the moment it is ready to publish, so
 * they can keep browsing instead of waiting on the Content page.
 */
export const VideoReadyWatcher = () => {
  const api = useApi();
  const qc = useQueryClient();
  const router = useRouter();
  const appActive = useAppActive();
  const isCreator = Boolean(useMe().data?.creatorProfile);
  const seen = useRef<Map<string, { status: VideoStatus; hdReady: boolean }> | null>(null);

  const videos = useQuery({
    queryKey: MY_VIDEOS_KEY,
    queryFn: ({ signal }) => listMyVideos(api, signal),
    enabled: isCreator,
    staleTime: 30_000,
    refetchInterval: (query) => {
      if (!appActive) return false;
      const list = query.state.data ?? [];
      if (list.some(isInFlight)) return POLL_MS;
      // Watchable at SD but HD still encoding: keep checking so we can announce when HD lands.
      if (list.some(isHdPending)) return HD_POLL_MS;
      return false;
    },
  });

  useEffect(() => {
    const list = videos.data;
    if (!list) return;

    const previous = seen.current;
    seen.current = new Map(
      list.map((v) => [v.id, { status: v.status, hdReady: v.hdReady }]),
    );
    if (!previous) return; // first load: just remember what is already there

    let announced = false;
    for (const video of list) {
      const before = previous.get(video.id);
      if (!before) continue;

      if (
        BEFORE_READY.includes(before.status) &&
        (video.status === 'READY' || video.status === 'PUBLISHED')
      ) {
        toast.success(
          `"${video.title}" is ready to publish. Tap to open Content.`,
          () => router.push('/content'),
        );
        announced = true;
      } else if (BEFORE_READY.includes(before.status) && video.status === 'FAILED') {
        toast.error(`"${video.title}" couldn't be processed. Open Content for details.`);
      } else if (!before.hdReady && video.hdReady) {
        // The video was already watchable; HD has just finished encoding.
        toast.success(
          `HD is ready for "${video.title}". Tap to open Content.`,
          () => router.push('/content'),
        );
        announced = true;
      }
    }
    // The backend also files an in-app notification for each of these; refresh the bell so the badge shows it.
    if (announced) void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
  }, [videos.data, router, qc]);

  return null;
};
