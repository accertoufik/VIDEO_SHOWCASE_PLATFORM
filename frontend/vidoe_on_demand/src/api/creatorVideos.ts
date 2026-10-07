import type { Api } from './client';
import type { MyVideo, VideoStatus, Visibility } from '@/types/creatorVideo';

const required = { auth: 'required' } as const;

type RawMyVideo = {
  id: string;
  title: string;
  description?: string | null;
  categoryId?: string | null;
  status: VideoStatus;
  visibility: Visibility;
  requestedVisibility?: Visibility | null;
  durationMs?: number | string | null;
  hdReady?: boolean;
  createdAt: string;
  publishedAt?: string | null;
  thumbnailUrl?: string | null;
};

const toMyVideo = (raw: RawMyVideo): MyVideo => ({
  id: raw.id,
  title: raw.title,
  description: raw.description ?? null,
  categoryId: raw.categoryId ?? null,
  status: raw.status,
  visibility: raw.visibility,
  requestedVisibility: raw.requestedVisibility ?? null,
  durationSec: raw.durationMs != null ? Number(raw.durationMs) / 1000 : null,
  hdReady: Boolean(raw.hdReady),
  createdAt: raw.createdAt,
  publishedAt: raw.publishedAt ?? null,
  thumbnailUrl: raw.thumbnailUrl ?? null,
});

export const listMyVideos = async (
  api: Api,
  signal?: AbortSignal,
): Promise<MyVideo[]> => {
  const data = await api.get<{ videos: RawMyVideo[] }>('/api/videos/mine', {
    ...required,
    signal,
  });
  return (data.videos ?? []).map(toMyVideo);
};

/** Also used to change visibility on an already-published video. */
export const publishVideo = (
  api: Api,
  videoId: string,
  visibility: Visibility,
) => api.post(`/api/videos/${videoId}/publish`, { visibility }, required);

/** Metadata only. Visibility stays controlled by publish. Send just the fields that changed. */
export const updateVideo = (
  api: Api,
  videoId: string,
  changes: { title?: string; description?: string; categoryId?: string },
) => api.patch(`/api/videos/${videoId}`, changes, required);

/** Soft delete on the backend: it disappears from every list, but the files are kept. */
export const deleteVideo = (api: Api, videoId: string) =>
  api.del(`/api/videos/${videoId}`, undefined, required);
