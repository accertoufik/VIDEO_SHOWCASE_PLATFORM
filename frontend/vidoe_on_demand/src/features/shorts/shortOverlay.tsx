import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { GlassButton } from '@/components/ui/GlassButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { useDockInset } from '@/components/navigation/useDockInset';
import { colors, layout, spacing } from '@/css';
import { CommentsSheet } from '@/features/video/CommentsSheet';
import {
  useShare,
  useToggleFollow,
  useToggleLike,
  useToggleSave,
} from '@/hooks/mutations/useVideoSocial';
import { useVideo } from '@/hooks/queries/useVideo';
import { useAuthGate } from '@/lib/auth/useAuthGate';
import type { VideoCardData, VideoDetail, ViewerState } from '@/types/video';
import { formatCount, formatRelativeTime } from '@/utils/format';
import { ShortAction } from './ShortAction';

type Props = {
  video: VideoCardData;
  commentsOpen: boolean;
  onCommentsOpenChange: (open: boolean) => void;
};

type ActionsProps = {
  detail: VideoDetail;
  viewer: ViewerState | null;
  onOpenComments: () => void;
};

// Split out so the social hooks only run once the detail (counts + viewer flags) has loaded.
const Actions = ({ detail, viewer, onOpenComments }: ActionsProps) => {
  const ensureSignedIn = useAuthGate();
  const like = useToggleLike(detail.id);
  const save = useToggleSave(detail.id);
  const share = useShare(detail);
  const liked = Boolean(viewer?.isLiked);
  const saved = Boolean(viewer?.isSaved);

  return (
    <View style={styles.actions}>
      <ShortAction
        icon='heart-outline'
        activeIcon='heart'
        active={liked}
        label={liked ? 'Unlike' : 'Like'}
        count={formatCount(detail.likeCount)}
        onPress={() =>
          ensureSignedIn() && !like.isPending && like.mutate(!liked)
        }
      />
      <ShortAction
        icon='chatbubble-outline'
        label='Comments'
        count={formatCount(detail.commentCount)}
        onPress={onOpenComments}
      />
      <ShortAction
        icon='arrow-redo-outline'
        label='Share'
        count={formatCount(detail.shareCount)}
        onPress={share}
      />
      <ShortAction
        icon='bookmark-outline'
        activeIcon='bookmark'
        active={saved}
        label={saved ? 'Unsave' : 'Save'}
        onPress={() =>
          ensureSignedIn() && !save.isPending && save.mutate(!saved)
        }
      />
    </View>
  );
};

const FollowPill = ({
  detail,
  viewer,
}: {
  detail: VideoDetail;
  viewer: ViewerState | null;
}) => {
  const ensureSignedIn = useAuthGate();
  const follow = useToggleFollow(detail.id, detail.creator.id);
  if (viewer?.isOwner) return null; // can't follow your own channel
  const following = Boolean(viewer?.isFollowingCreator);
  return (
    <GlassButton
      label={following ? 'Following' : 'Follow'}
      variant={following ? 'glass' : 'primary'}
      size='sm'
      onPress={() =>
        ensureSignedIn() && !follow.isPending && follow.mutate(!following)
      }
    />
  );
};

export const ShortOverlay = ({
  video,
  commentsOpen,
  onCommentsOpenChange,
}: Props) => {
  const router = useRouter();
  const dockInset = useDockInset();
  const detail = useVideo(video.id);
  const loaded = detail.data;
  const [captionOpen, setCaptionOpen] = useState(false);

  return (
    <View
      style={[styles.root, { paddingBottom: dockInset }]}
      pointerEvents='box-none'
    >
      {/* Legibility scrim behind the text and buttons. */}
      <LinearGradient
        colors={['transparent', colors.overlay.scrimStrong]}
        style={styles.scrim}
        pointerEvents='none'
      />

      <View style={styles.row} pointerEvents='box-none'>
        <View style={styles.info} pointerEvents='box-none'>
          <View style={styles.creatorRow}>
            <PressableScale
              style={styles.creator}
              disabled={!video.creator.username}
              accessibilityRole='button'
              accessibilityLabel={`Open ${video.creator.name}'s channel`}
              onPress={() =>
                video.creator.username &&
                router.push({
                  pathname: '/creator/[username]',
                  params: { username: video.creator.username },
                })
              }
            >
              <Avatar uri={video.creator.avatarUrl} name={video.creator.name} size='sm' />
              <AppText variant='title' numberOfLines={1} style={styles.creatorName}>
                {video.creator.username ? `@${video.creator.username}` : video.creator.name}
              </AppText>
            </PressableScale>
            {loaded ? <FollowPill detail={loaded.video} viewer={loaded.viewer} /> : null}
          </View>
          <PressableScale
            onPress={() => setCaptionOpen((v) => !v)}
            accessibilityRole='button'
            accessibilityLabel={captionOpen ? 'Collapse caption' : 'Expand caption'}
            scaleTo={0.99}
          >
            <AppText variant='body' numberOfLines={captionOpen ? 6 : 2}>
              {video.title}
            </AppText>
          </PressableScale>
          <AppText variant='caption' color='secondary'>
            {[`${formatCount(video.viewCount)} views`, formatRelativeTime(video.publishedAt)].filter(Boolean).join(' · ')}
          </AppText>
        </View>

        {loaded ? (
          <Actions
            detail={loaded.video}
            viewer={loaded.viewer}
            onOpenComments={() => onCommentsOpenChange(true)}
          />
        ) : null}
      </View>

      <CommentsSheet
        videoId={video.id}
        visible={commentsOpen}
        count={loaded?.video.commentCount ?? 0}
        onClose={() => onCommentsOpenChange(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '55%' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.lg,
    paddingHorizontal: layout.screenPadding,
  },
  info: { flex: 1, gap: spacing.sm, paddingBottom: spacing.sm },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  creator: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  creatorName: { flexShrink: 1 },
  // Same bottom padding as the info block, so the last rail item (Save) lines up with the views / time row.
  actions: { alignItems: 'center', gap: spacing.lg, paddingBottom: spacing.sm },
});
