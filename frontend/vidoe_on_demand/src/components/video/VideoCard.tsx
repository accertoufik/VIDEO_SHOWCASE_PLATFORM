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

type Props = { video: VideoCardData };

// Long-form feed card: big thumbnail, then avatar + title + "Creator · 1.2K views · 2h ago".
export const VideoCard = memo(({ video }: Props) => {
  const router = useRouter();
  const meta = [
    video.creator.name,
    `${formatCount(video.viewCount)} views`,
    formatRelativeTime(video.publishedAt),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <PressableScale
      accessibilityRole='button'
      accessibilityLabel={videoA11yLabel(video)}
      onPress={() =>
        router.push({ pathname: '/video/[id]', params: { id: video.id } })
      }
    >
      <Thumbnail uri={video.thumbnailUrl} durationMs={video.durationMs} />
      <View style={styles.meta}>
        <Avatar
          uri={video.creator.avatarUrl}
          name={video.creator.name}
          size='sm'
        />
        <View style={styles.text}>
          <AppText variant='title' numberOfLines={2}>
            {video.title}
          </AppText>
          <AppText variant='bodySmall' color='secondary' numberOfLines={1}>
            {meta}
          </AppText>
        </View>
      </View>
    </PressableScale>
  );
});
VideoCard.displayName = 'VideoCard';

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md },
  text: { flex: 1, gap: spacing.xs },
});
