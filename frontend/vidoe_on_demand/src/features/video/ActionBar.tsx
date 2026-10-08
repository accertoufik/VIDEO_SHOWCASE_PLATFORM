import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { GlassButton } from '@/components/ui/GlassButton';
import { spacing } from '@/css';
import { useVideoDownload } from '@/hooks/useDownloads';
import {
  useShare,
  useToggleLike,
  useToggleSave,
} from '@/hooks/mutations/useVideoSocial';
import { useAuthGate } from '@/lib/auth/useAuthGate';
import type { VideoDetail, ViewerState } from '@/types/video';
import { formatCount } from '@/utils/format';

type Props = {
  video: VideoDetail;
  viewer: ViewerState | null;
  onOpenComments: () => void;
};

export const ActionBar = ({ video, viewer, onOpenComments }: Props) => {
  const router = useRouter();
  const ensureSignedIn = useAuthGate();
  const like = useToggleLike(video.id);
  const save = useToggleSave(video.id);
  const share = useShare(video);
  const download = useVideoDownload(video);

  const liked = Boolean(viewer?.isLiked);
  const saved = Boolean(viewer?.isSaved);

  const onLike = () => {
    if (!ensureSignedIn() || like.isPending) return;
    like.mutate(!liked);
  };
  const onSave = () => {
    if (!ensureSignedIn() || save.isPending) return;
    save.mutate(!saved);
  };

  const status = download.record?.status;
  const percent = Math.round((download.record?.progress ?? 0) * 100);

  // One button, five states. Downloads need no sign-in.
  const downloadButton = (() => {
    switch (status) {
      case 'completed':
        return {
          label: 'Downloaded',
          icon: 'checkmark-circle' as const,
          variant: 'primary' as const,
          onPress: () =>
            router.push({
              pathname: '/offline/[id]',
              params: { id: video.id },
            }),
        };
      case 'downloading':
        return {
          label: `${percent}%`,
          icon: 'close-circle-outline' as const,
          variant: 'glass' as const,
          onPress: download.cancel,
        };
      case 'queued':
        return {
          label: 'Queued',
          icon: 'close-circle-outline' as const,
          variant: 'glass' as const,
          onPress: download.cancel,
        };
      case 'failed':
        return {
          label: 'Retry',
          icon: 'refresh' as const,
          variant: 'glass' as const,
          onPress: download.start,
        };
      default:
        return {
          label: 'Download',
          icon: 'download-outline' as const,
          variant: 'glass' as const,
          onPress: download.start,
        };
    }
  })();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      <GlassButton
        label={formatCount(video.likeCount)}
        icon={liked ? 'heart' : 'heart-outline'}
        variant={liked ? 'primary' : 'glass'}
        selected={liked}
        size='sm'
        accessibilityLabel={
          liked
            ? `Unlike, ${video.likeCount} likes`
            : `Like, ${video.likeCount} likes`
        }
        onPress={onLike}
      />
      <GlassButton
        label={saved ? 'Saved' : 'Save'}
        icon={saved ? 'bookmark' : 'bookmark-outline'}
        variant={saved ? 'primary' : 'glass'}
        selected={saved}
        size='sm'
        onPress={onSave}
      />
      <GlassButton
        label={formatCount(video.shareCount)}
        icon='share-social-outline'
        size='sm'
        accessibilityLabel={`Share, shared ${video.shareCount} times`}
        onPress={share}
      />
      {video.canDownload ? (
        <GlassButton
          label={downloadButton.label}
          icon={downloadButton.icon}
          variant={downloadButton.variant}
          size='sm'
          accessibilityLabel={`Download: ${downloadButton.label}`}
          onPress={downloadButton.onPress}
        />
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({ row: { gap: spacing.sm } });
