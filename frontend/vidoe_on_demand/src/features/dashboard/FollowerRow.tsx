import { useRouter } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { spacing } from '@/css';
import type { Follower } from '@/types/library';
import { formatRelativeTime } from '@/utils/format';

/** One person following your channel: picture, name, @handle and when they followed. Tap to open their profile. */
export const FollowerRow = memo(({ follower }: { follower: Follower }) => {
  const router = useRouter();
  const handle = follower.username ? `@${follower.username}` : null;
  const when = follower.followedAt ? `Followed ${formatRelativeTime(follower.followedAt)}` : null;

  return (
    <PressableScale
      style={styles.row}
      accessibilityRole='button'
      accessibilityLabel={`${follower.name}${when ? `, ${when}` : ''}`}
      // A profile page is addressed by username.
      disabled={!follower.username}
      onPress={() =>
        follower.username &&
        router.push({ pathname: '/creator/[username]', params: { username: follower.username } })
      }
    >
      <Avatar uri={follower.avatarUrl} name={follower.name} size='md' />
      <View style={styles.text}>
        <AppText variant='title' numberOfLines={1}>
          {follower.name}
        </AppText>
        <AppText variant='bodySmall' color='secondary' numberOfLines={1}>
          {[handle, when].filter(Boolean).join(' · ')}
        </AppText>
      </View>
    </PressableScale>
  );
});
FollowerRow.displayName = 'FollowerRow';

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
});
