import { useRouter } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { spacing } from '@/css';
import type { CreatorResult } from '@/types/search';
import { formatCount } from '@/utils/format';

export const CreatorResultRow = memo(
  ({ creator }: { creator: CreatorResult }) => {
    const router = useRouter();
    const handle = creator.username
      ? `@${creator.username}`
      : creator.channelName;
    const followers = `${formatCount(creator.followerCount)} ${creator.followerCount === 1 ? 'follower' : 'followers'}`;

    return (
      <PressableScale
        style={styles.row}
        accessibilityRole='button'
        accessibilityLabel={`${creator.name}, ${followers}`}
        // A channel page is addressed by username, so creators without one can't be opened.
        disabled={!creator.username}
        onPress={() =>
          creator.username &&
          router.push({
            pathname: '/creator/[username]',
            params: { username: creator.username },
          })
        }
      >
        <Avatar uri={creator.avatarUrl} name={creator.name} size='md' />
        <View style={styles.text}>
          <AppText variant='title' numberOfLines={1}>
            {creator.name}
          </AppText>
          <AppText variant='bodySmall' color='secondary' numberOfLines={1}>
            {handle} · {followers}
          </AppText>
        </View>
      </PressableScale>
    );
  },
);
CreatorResultRow.displayName = 'CreatorResultRow';

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  text: { flex: 1, gap: 2 },
});
