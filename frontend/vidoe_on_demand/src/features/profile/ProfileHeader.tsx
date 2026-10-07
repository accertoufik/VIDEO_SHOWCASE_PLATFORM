import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { RemoteImage as Image } from '@/components/ui/RemoteImage';
import { Avatar } from '@/components/ui/Avatar';
import { ExpandableText } from '@/components/ui/ExpandableText';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';

type Stat = { label: string; value: string };

type Props = {
  name: string;
  username: string;
  avatarUrl: string | null;
  bannerUrl?: string | null;
  bio?: string | null;
  verified?: boolean;
  /** Only real numbers the API gives us (e.g. a creator's followers). Empty = no stats row. */
  stats?: Stat[];
};

// Left-aligned identity block: optional channel banner, the avatar at the left (overlapping the banner), then name
// (+ verified), @handle, the counts ("12 Following  8 Followers") and the bio.
export const ProfileHeader = ({ name, username, avatarUrl, bannerUrl, bio, verified, stats }: Props) => (
  <View style={styles.root}>
    {bannerUrl ? (
      <Image
        source={{ uri: bannerUrl, cacheKey: bannerUrl.split('?')[0] }}
        style={styles.banner}
        contentFit='cover'
        accessibilityIgnoresInvertColors
      />
    ) : null}

    <View style={[styles.avatar, bannerUrl ? styles.overlap : null]}>
      <Avatar uri={avatarUrl} name={name} size='xl' />
    </View>

    <View style={styles.names}>
      <View style={styles.nameRow}>
        <AppText variant='h2' numberOfLines={1} style={styles.name}>
          {name}
        </AppText>
        {verified ? (
          <Ionicons name='checkmark-circle' size={20} color={colors.accent.text} accessibilityLabel='Verified' />
        ) : null}
      </View>
      <AppText variant='bodySmall' color='secondary'>
        @{username}
      </AppText>
    </View>

    {stats?.length ? (
      <View style={styles.stats}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <AppText variant='title'>{stat.value}</AppText>
            <AppText variant='bodySmall' color='secondary'>
              {stat.label}
            </AppText>
          </View>
        ))}
      </View>
    ) : null}

    {bio ? <ExpandableText text={bio} lines={3} /> : null}
  </View>
);

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  banner: { width: '100%', aspectRatio: 16 / 5, borderRadius: radii.lg, backgroundColor: colors.surface.glassMedium },
  avatar: { alignSelf: 'flex-start' },
  overlap: { marginTop: -spacing.xxxl, marginLeft: spacing.lg },
  names: { gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { flexShrink: 1 },
  stats: { flexDirection: 'row', gap: spacing.xl },
  stat: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
});
