import type { Ionicons } from '@expo/vector-icons';
import type { MyVideo, Visibility } from '@/types/creatorVideo';

export type Tone = 'primary' | 'secondary' | 'muted' | 'error';
type IconName = keyof typeof Ionicons.glyphMap;

export const VISIBILITY_LABEL: Record<Visibility, string> = {
  PUBLIC: 'Public',
  UNLISTED: 'Unlisted',
  PRIVATE: 'Private',
};

/** Plain-language status for a creator's video. */
export const describeStatus = (
  video: MyVideo,
): { label: string; tone: Tone; icon: IconName } => {
  switch (video.status) {
    case 'DRAFT':
    case 'UPLOADING':
      return {
        label: 'Upload not finished',
        tone: 'muted',
        icon: 'cloud-offline-outline',
      };
    case 'UPLOADED':
    case 'PROCESSING':
      return {
        label: 'Processing',
        tone: 'secondary',
        icon: 'hourglass-outline',
      };
    case 'READY':
      return {
        label: 'Ready to publish',
        tone: 'primary',
        icon: 'checkmark-circle-outline',
      };
    case 'PUBLISHED':
      return {
        label: VISIBILITY_LABEL[video.visibility],
        tone: 'primary',
        icon:
          video.visibility === 'PUBLIC'
            ? 'globe-outline'
            : 'lock-closed-outline',
      };
    case 'FAILED':
      return {
        label: 'Processing failed',
        tone: 'error',
        icon: 'alert-circle-outline',
      };
    default:
      return {
        label: video.status.toLowerCase(),
        tone: 'muted',
        icon: 'ellipse-outline',
      };
  }
};
