import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar } from '@/components/ui/Avatar';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { GlassIconButton } from '@/components/ui/GlassIconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { TamasaWordmark } from '@/components/brand';
import { layout, spacing } from '@/css';

type Props = {
  signedIn: boolean;
  avatarUri?: string | null;
  name?: string | null;
  onSearch: () => void;
  onProfile: () => void;
};

// TAMASA wordmark (Bitcount Ink) on the left; Search, Bell and Avatar on the right.
export const HomeHeader = ({
  signedIn,
  avatarUri,
  name,
  onSearch,
  onProfile,
}: Props) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.top}>
        <TamasaWordmark />
        {signedIn ? (
          <View style={styles.actions}>
            <GlassIconButton icon='search' label='Search' onPress={onSearch} />
            <NotificationBell />
            <PressableScale
              onPress={onProfile}
              accessibilityLabel='Open your profile'
              style={styles.avatarTap}
            >
              <Avatar uri={avatarUri} name={name} size='md' />
            </PressableScale>
          </View>
        ) : (
          <View style={styles.actions}>
            <GlassIconButton icon='search' label='Search' onPress={onSearch} />
            <GlassIconButton icon='person-outline' label='Sign in' onPress={onProfile} />
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
    gap: spacing.lg,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatarTap: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
