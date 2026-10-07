import { API_BASE_URL } from '@/lib/config';

/** "auto" = the adaptive master playlist. Otherwise the master narrowed to one rung (e.g. "720p"), which keeps the captions menu. */
export const streamUrl = (videoId: string, quality = 'auto') =>
  `${API_BASE_URL}/api/videos/${videoId}/stream/${quality === 'auto' ? 'master.m3u8' : `master-${quality}.m3u8`}`;
