import { useRouter } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { spacing } from '@/css';
import type { VideoCardData } from '@/types/video';
import { formatCount, formatRelativeTime } from '@/utils/format';
import { Thumbnail } from './Thumbnail';
import { videoA11yLabel } from '@/lib/a11y/videoLabel';

type Props = {
  video: VideoCardData;
  /** Hide the creator row (e.g. on the creator's own page, where it would just open the same page). */
  hideCreator?: boolean;
};

// Long-form feed card, in two separate tap areas: thumbnail + title open the video; the creator row opens the channel.
export const VideoCard = memo(({ video, hideCreator = false }: Props) => {
  const router = useRouter();
  const meta = [`${formatCount(video.viewCount)} views`, formatRelativeTime(video.publishedAt)]
    .filter(Boolean)
    .join(' · ');
  const username = video.creator.username;

  return (
    <View>
      <PressableScale
        accessibilityRole='button'
        accessibilityLabel={videoA11yLabel(video)}
        onPress={() =>
          router.push({ pathname: '/video/[id]', params: { id: video.id } })
        }
      >
        <Thumbnail uri={video.thumbnailUrl} durationMs={video.durationMs} />
        <View style={styles.info}>
          <AppText variant='title' numberOfLines={2}>
            {video.title}
          </AppText>
          <AppText variant='bodySmall' color='secondary' numberOfLines={1}>
            {meta}
          </AppText>
        </View>
      </PressableScale>
      {hideCreator ? null : (
        <PressableScale
          disabled={!username}
          accessibilityRole='button'
          accessibilityLabel={`Open ${video.creator.name}'s channel`}
          onPress={() =>
            username &&
            router.push({ pathname: '/creator/[username]', params: { username } })
          }
          style={styles.creator}
        >
          <Avatar uri={video.creator.avatarUrl} name={video.creator.name} size='sm' />
          <AppText variant='bodySmall' color='secondary' numberOfLines={1} style={styles.creatorName}>
            {video.creator.name}
          </AppText>
        </PressableScale>
      )}
    </View>
  );
});
VideoCard.displayName = 'VideoCard';

const styles = StyleSheet.create({
  info: { gap: spacing.xs, paddingTop: spacing.md },
  creator: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  creatorName: { flexShrink: 1 },
});
