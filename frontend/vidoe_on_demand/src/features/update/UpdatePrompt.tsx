import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';
import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { GlassButton } from '@/components/ui/GlassButton';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';

/**
 * Over-the-air updates: checks when the app opens, downloads a new version in the background and then asks
 * the user to restart into it. "Later" keeps using the current version; the update then applies the next time
 * the app is opened from closed. Does nothing in development builds.
 */
export const UpdatePrompt = () => {
  const enabled = Updates.isEnabled && !__DEV__;
  const { isUpdateAvailable, isUpdatePending, isDownloading } = Updates.useUpdates();
  const [dismissed, setDismissed] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (enabled) void Updates.checkForUpdateAsync().catch(() => {});
  }, [enabled]);

  useEffect(() => {
    if (enabled && isUpdateAvailable && !isUpdatePending && !isDownloading) {
      void Updates.fetchUpdateAsync().catch(() => {});
    }
  }, [enabled, isUpdateAvailable, isUpdatePending, isDownloading]);

  if (!enabled || !isUpdatePending || dismissed) return null;

  const restart = async () => {
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch {
      setRestarting(false);
    }
  };

  return (
    <Modal visible transparent animationType='fade' statusBarTranslucent onRequestClose={() => setDismissed(true)}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Ionicons name='arrow-down-circle-outline' size={40} color={colors.accent.text} />
          <AppText variant='h3' style={styles.center} accessibilityRole='header'>
            Update available
          </AppText>
          <AppText variant='bodySmall' color='secondary' style={styles.center}>
            A new version of Tamasa is ready.
          </AppText>
          <View style={styles.actions}>
            <GlassButton label='Update now' variant='primary' size='lg' fullWidth loading={restarting} onPress={restart} />
            <GlassButton label='Later' variant='ghost' size='md' fullWidth disabled={restarting} onPress={() => setDismissed(true)} />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.overlay.scrim,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
    backgroundColor: colors.background.elevated,
  },
  center: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: spacing.sm, paddingTop: spacing.sm },
});
