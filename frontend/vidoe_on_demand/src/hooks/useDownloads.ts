import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { getDownloadUrl } from '@/api/video';
import { downloadStore } from '@/lib/downloads/downloadStore';
import type { DownloadMeta, DownloadRecord } from '@/lib/downloads/types';
import { useApi } from '@/lib/auth/useApi';
import type { VideoDetail } from '@/types/video';

/** Everything on this device, newest first. `ready` turns true once the saved list has been read from disk. */
export const useDownloads = () => {
  useEffect(() => {
    void downloadStore.hydrate();
  }, []);
  const snapshot = useSyncExternalStore(
    downloadStore.subscribe,
    downloadStore.getSnapshot,
  );
  return useMemo(
    () => ({
      ready: snapshot.ready,
      items: [...snapshot.records].sort((a, b) => b.createdAt - a.createdAt),
    }),
    [snapshot],
  );
};

export const useDownloadActions = () => {
  const api = useApi();

  const start = (meta: DownloadMeta) =>
    downloadStore.enqueue(meta, () =>
      getDownloadUrl(api, meta.videoId).then((data) => data.downloadUrl),
    );

  return {
    start,
    retry: (record: DownloadRecord) =>
      start({
        videoId: record.videoId,
        title: record.title,
        creatorName: record.creatorName,
        durationMs: record.durationMs,
        thumbnailUrl: record.thumbnailUrl,
      }),
    cancel: downloadStore.cancel,
    remove: downloadStore.remove,
  };
};

/** Download state + actions for one video, for the button on the video page. */
export const useVideoDownload = (video: VideoDetail) => {
  const { items } = useDownloads();
  const actions = useDownloadActions();
  const record = items.find((item) => item.videoId === video.id);

  const start = () =>
    actions.start({
      videoId: video.id,
      title: video.title,
      creatorName: video.creator.name,
      durationMs: video.durationMs,
      thumbnailUrl: video.thumbnailUrl,
    });

  return { record, start, cancel: () => actions.cancel(video.id) };
};
