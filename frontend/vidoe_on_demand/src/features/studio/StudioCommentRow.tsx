import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { colors, layout, radii, spacing } from '@/css';
import type { StudioComment } from '@/types/studio';
import { formatRelativeTime } from '@/utils/format';

type Props = {
  comment: StudioComment;
  onOpenVideo: (videoId: string) => void;
  onDelete: (comment: StudioComment) => void;
};

export const StudioCommentRow = ({ comment, onOpenVideo, onDelete }: Props) => {
  const who =
    comment.author.displayName ?? comment.author.username ?? 'Someone';

  return (
    <View style={styles.row}>
      <View style={styles.body}>
        <View style={styles.head}>
          <AppText variant='label' numberOfLines={1} style={styles.who}>
            {who}
          </AppText>
          {comment.isReply ? (
            <AppText variant='caption' color='muted'>
              Reply
            </AppText>
          ) : null}
          <AppText variant='caption' color='muted'>
            {formatRelativeTime(comment.createdAt)}
          </AppText>
        </View>
        <AppText variant='body'>{comment.body}</AppText>
        <PressableScale
          onPress={() => onOpenVideo(comment.video.id)}
          accessibilityRole='link'
          accessibilityLabel={`Open video ${comment.video.title}`}
        >
          <AppText variant='bodySmall' color='accent' numberOfLines={1}>
            on {comment.video.title}
          </AppText>
        </PressableScale>
      </View>

      <PressableScale
        onPress={() => onDelete(comment)}
        accessibilityRole='button'
        accessibilityLabel={`Delete comment by ${who}`}
        style={styles.delete}
      >
        <Ionicons name='trash-outline' size={20} color={colors.status.error} />
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.glassMedium,
  },
  body: { flex: 1, gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  who: { flexShrink: 1 },
  delete: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
