import { API_BASE_URL } from '@/lib/config';

/**
 * "auto" = the adaptive master playlist. Otherwise the master narrowed to one rung (e.g. "720p"), which keeps the
 * captions menu. `ticket` is the playback ticket for a non-public video (see getPlaybackTicket): it goes in the URL
 * because the player must NOT send a login header (storage rejects requests that carry both a signed link and one).
 */
export const streamUrl = (videoId: string, quality = 'auto', ticket?: string) =>
  `${API_BASE_URL}/api/videos/${videoId}/stream/${quality === 'auto' ? 'master.m3u8' : `master-${quality}.m3u8`}${
    ticket ? `?pt=${ticket}` : ''
  }`;
