import type { VideoCardData } from '@/types/video';
import { formatCount, formatDuration } from '@/utils/format';

/** One spoken sentence for a video card: title, channel, views and length (what a sighted user reads at a glance). */
export const videoA11yLabel = (video: VideoCardData, prefix?: string) =>
  [
    `${prefix ? `${prefix}: ` : ''}${video.title}`,
    `by ${video.creator.name}`,
    `${formatCount(video.viewCount)} views`,
    video.durationMs ? formatDuration(video.durationMs) : null,
  ]
    .filter(Boolean)
    .join(', ');
