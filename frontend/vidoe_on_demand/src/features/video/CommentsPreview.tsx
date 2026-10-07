import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '@/components/ui/Avatar';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';
import { useComments } from '@/hooks/queries/useComments';
import { formatCount } from '@/utils/format';

type Props = { videoId: string; count: number; onOpen: () => void };

/** "Comments 863" card with the first comment as a teaser. Tap to open the full comments sheet. */
export const CommentsPreview = ({ videoId, count, onOpen }: Props) => {
  // Same query as the sheet, so opening it afterwards needs no extra request.
  const comments = useComments(videoId, true);
  const first = comments.data?.[0];

  return (
    <PressableScale
      onPress={onOpen}
      accessibilityRole='button'
      accessibilityLabel={`Comments, ${count}. Open comments`}
      scaleTo={0.99}
      style={styles.box}
    >
      <View style={styles.head}>
        <AppText variant='label' color='secondary'>
          Comments
        </AppText>
        <AppText variant='label' color='muted'>
          {formatCount(count)}
        </AppText>
        <View style={styles.spacer} />
        <Ionicons name='chevron-expand-outline' size={16} color={colors.icon.muted} />
      </View>
      {first ? (
        <View style={styles.teaser}>
          <Avatar uri={first.author.avatarUrl} name={first.author.displayName} size='xs' />
          <AppText variant='bodySmall' numberOfLines={2} style={styles.body}>
            {first.body}
          </AppText>
        </View>
      ) : (
        <AppText variant='bodySmall' color='muted'>
          {comments.isPending ? 'Loading comments...' : 'No comments yet. Be the first to say something.'}
        </AppText>
      )}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.base,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  spacer: { flex: 1 },
  teaser: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  body: { flex: 1 },
});
