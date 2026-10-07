import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { GlassButton } from '@/components/ui/GlassButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { layout, spacing } from '@/css';
import { useToggleFollow } from '@/hooks/mutations/useVideoSocial';
import { useAuthGate } from '@/lib/auth/useAuthGate';
import type { VideoDetail, ViewerState } from '@/types/video';
import { formatCount, formatRelativeTime } from '@/utils/format';
import { ActionBar } from './ActionBar';
import { CommentsPreview } from './CommentsPreview';
import { DescriptionBox } from './DescriptionBox';
import { CommentsSheet } from './CommentsSheet';

type Props = {
  video: VideoDetail;
  viewer: ViewerState | null;
  /** The full video is still loading: show the title/creator now, hold back the buttons that need real data. */
  loading?: boolean;
};

export const VideoDetails = ({ video, viewer, loading = false }: Props) => {
  const router = useRouter();
  const ensureSignedIn = useAuthGate();
  const follow = useToggleFollow(video.id, video.creator.id);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const meta = [
    `${formatCount(video.viewCount)} views`,
    formatRelativeTime(video.publishedAt),
  ]
    .filter(Boolean)
    .join(' · ');
  const followers = `${formatCount(video.creator.followerCount)} ${video.creator.followerCount === 1 ? 'follower' : 'followers'}`;
  const following = Boolean(viewer?.isFollowingCreator);

  const onFollow = () => {
    if (!ensureSignedIn() || follow.isPending) return;
    follow.mutate(!following);
  };

  return (
    <View style={styles.root}>
      <AppText variant='h2'>{video.title}</AppText>
      <AppText variant='bodySmall' color='secondary'>
        {meta}
      </AppText>

      <View style={styles.creatorRow}>
        <PressableScale
          style={styles.creator}
          disabled={!video.creator.username}
          accessibilityRole='button'
          accessibilityLabel={`${video.creator.name}, ${followers}`}
          onPress={() =>
            video.creator.username &&
            router.push({
              pathname: '/creator/[username]',
              params: { username: video.creator.username },
            })
          }
        >
          <Avatar
            uri={video.creator.avatarUrl}
            name={video.creator.name}
            size='md'
          />
          <View style={styles.creatorText}>
            <AppText variant='title' numberOfLines={1}>
              {video.creator.name}
            </AppText>
            <AppText variant='bodySmall' color='secondary'>
              {followers}
            </AppText>
          </View>
        </PressableScale>
        {/* You can't follow your own channel (the backend rejects it). */}
        {loading || viewer?.isOwner ? null : (
          <GlassButton
            label={following ? 'Following' : 'Follow'}
            variant={following ? 'glass' : 'primary'}
            size='sm'
            onPress={onFollow}
          />
        )}
      </View>

      {loading ? (
        <Skeleton width='100%' height={36} radius='pill' />
      ) : (
        <ActionBar
          video={video}
          viewer={viewer}
          onOpenComments={() => setCommentsOpen(true)}
        />
      )}

      <DescriptionBox description={video.description} meta={meta} />

      <CommentsPreview
        videoId={video.id}
        count={video.commentCount}
        onOpen={() => setCommentsOpen(true)}
      />

      <AppText variant='h3' style={styles.upNext}>
        Up next
      </AppText>

      <CommentsSheet
        videoId={video.id}
        visible={commentsOpen}
        count={video.commentCount}
        belowPlayer
        onClose={() => setCommentsOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  creator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  creatorText: { flex: 1 },
  upNext: { paddingTop: spacing.lg, paddingBottom: spacing.md },
});
