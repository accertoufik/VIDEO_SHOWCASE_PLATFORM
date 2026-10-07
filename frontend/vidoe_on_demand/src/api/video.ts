import type { VideoCardData } from '@/types/video';
import type { Api } from './client';
import { toVideoCard, toVideoDetail, toViewer } from './mappers';

type Raw = Record<string, unknown>;

/** Optional auth: anonymous viewers get `viewer: null`; signed-in viewers get like/save/follow/resume state. */
export const getVideo = async (api: Api, id: string, signal?: AbortSignal) => {
  const data = await api.get<{ video: Raw; viewer?: unknown }>(
    `/api/videos/${id}`,
    { auth: 'optional', signal },
  );
  return { video: toVideoDetail(data.video), viewer: toViewer(data.viewer) };
};

/** The plan documents the key as `relatedVideos`; my backend returns `videos`. Accept both. */
export const getRelated = async (
  api: Api,
  id: string,
  signal?: AbortSignal,
): Promise<VideoCardData[]> => {
  const data = await api.get<{ relatedVideos?: unknown; videos?: unknown }>(
    `/api/videos/${id}/related?limit=12`,
    { auth: 'optional', signal },
  );
  // Be forgiving about the shape: an array, or an object wrapping { videos: [...] }.
  const pick = (v: unknown): Raw[] =>
    Array.isArray(v)
      ? (v as Raw[])
      : Array.isArray((v as { videos?: unknown } | undefined)?.videos)
        ? ((v as { videos: Raw[] }).videos)
        : [];
  const rows = pick(data.relatedVideos);
  return (rows.length ? rows : pick(data.videos)).map(toVideoCard);
};

export const getDownloadUrl = async (api: Api, id: string) => {
  const data = await api.get<{ downloadUrl: unknown; filename?: string }>(
    `/api/videos/${id}/download`,
    { auth: 'optional' },
  );
  // Older API builds nested the object: { downloadUrl: { downloadUrl, filename } }.
  const inner = data.downloadUrl as { downloadUrl?: string; filename?: string } | string;
  return typeof inner === 'string'
    ? { downloadUrl: inner, filename: data.filename ?? '' }
    : { downloadUrl: String(inner?.downloadUrl ?? ''), filename: inner?.filename ?? '' };
};
