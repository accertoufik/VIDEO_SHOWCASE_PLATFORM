import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radii, spacing } from '@/css';
import { useIsOnline } from '@/lib/query/lifecycle';
import { AppText } from './Text';

/** A small pill under the status bar while there's no connection. It never blocks touches. */
export const OfflineBanner = () => {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;

  return (
    <View
      pointerEvents='none'
      style={[styles.wrap, { top: insets.top + spacing.sm }]}
    >
      <View
        style={styles.pill}
        accessibilityRole='alert'
        accessibilityLiveRegion='polite'
      >
        <AppText variant='label'>You're offline. Downloads still work.</AppText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.overlay.scrimStrong,
    borderWidth: 1,
    borderColor: colors.surface.borderStrong,
  },
});
