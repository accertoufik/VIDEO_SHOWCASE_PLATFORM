import { Ionicons } from '@expo/vector-icons';
import { RemoteImage as Image } from '@/components/ui/RemoteImage';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';
import type { AppNotification } from '@/types/notification';
import { formatRelativeTime } from '@/utils/format';

type IconName = keyof typeof Ionicons.glyphMap;

const ICON: Record<AppNotification['type'], IconName> = {
  NEW_FOLLOWER: 'person-add-outline',
  NEW_VIDEO_FROM_FOLLOWED: 'videocam-outline',
  COMMENT_REPLY: 'chatbubble-outline',
  VIDEO_COMMENTED: 'chatbubble-outline',
  VIDEO_LIKED: 'heart-outline',
  SYSTEM: 'megaphone-outline',
  UNKNOWN: 'notifications-outline',
};

type Props = {
  item: AppNotification;
  onPress: (item: AppNotification) => void;
};

export const NotificationRow = memo(({ item, onPress }: Props) => (
  <PressableScale
    onPress={() => onPress(item)}
    accessibilityRole='button'
    accessibilityLabel={`${item.read ? '' : 'Unread. '}${item.title}. ${item.body ?? ''}. ${formatRelativeTime(item.createdAt)}`}
    style={[styles.row, !item.read && styles.unread]}
  >
    {item.actor ? (
      <Avatar uri={item.actor.avatarUrl} name={item.actor.name} size='md' />
    ) : (
      <View style={styles.iconBubble}>
        <Ionicons name={ICON[item.type]} size={20} color={colors.text.primary} />
      </View>
    )}

    <View style={styles.text}>
      <AppText variant='label' numberOfLines={2}>
        {item.title}
      </AppText>
      {item.body ? (
        <AppText variant='bodySmall' color='secondary' numberOfLines={2}>
          {item.body}
        </AppText>
      ) : null}
      <AppText variant='caption' color='muted'>
        {formatRelativeTime(item.createdAt)}
      </AppText>
    </View>

    {item.video?.thumbnailUrl ? (
      <Image
        source={{
          uri: item.video.thumbnailUrl,
          cacheKey: item.video.thumbnailUrl.split('?')[0],
        }}
        style={styles.thumb}
        contentFit='cover'
        accessibilityIgnoresInvertColors
      />
    ) : null}
    {!item.read ? <View style={styles.dot} /> : null}
  </PressableScale>
));
NotificationRow.displayName = 'NotificationRow';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
  },
  unread: { backgroundColor: colors.accent.primarySoft },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.glassMedium,
  },
  text: { flex: 1, gap: spacing.xs },
  thumb: {
    width: 64,
    aspectRatio: 16 / 9,
    borderRadius: radii.sm,
    backgroundColor: colors.surface.glassMedium,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.accent.primary,
  },
});
