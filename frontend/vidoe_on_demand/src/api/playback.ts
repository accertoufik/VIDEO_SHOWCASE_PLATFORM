import type { Api } from './client';

export type ProgressBody = {
  positionMs: number;
  completionPercent: number;
  completed: boolean;
};

/** Once, when playback actually starts. Bumps the view count and writes history. */
export const recordWatch = (api: Api, id: string) =>
  api.post(`/api/videos/${id}/watch`, undefined, { auth: 'required' });

/** Periodic resume position (every ~15s while playing, and on pause). */
export const saveProgress = (api: Api, id: string, body: ProgressBody) =>
  api.patch(`/api/videos/${id}/progress`, body, { auth: 'required' });
