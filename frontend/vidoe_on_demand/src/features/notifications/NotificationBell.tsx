import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { GlassIconButton } from '@/components/ui/GlassIconButton';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';
import { useUnreadCount } from '@/hooks/queries/useNotifications';

export const NotificationBell = () => {
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const unread = useUnreadCount().data ?? 0;

  if (!isSignedIn) return null;

  return (
    <View>
      <GlassIconButton
        icon='notifications-outline'
        label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        onPress={() => router.push('/notifications')}
      />
      {unread > 0 ? (
        <View style={styles.badge} pointerEvents='none'>
          <AppText variant='caption' style={styles.badgeText}>
            {unread > 99 ? '99+' : unread}
          </AppText>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -spacing.xs,
    right: -spacing.xs,
    minWidth: 18,
    height: 18,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.status.error,
  },
  badgeText: { color: colors.text.primary },
});
