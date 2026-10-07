import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { getPreferences } from '@/lib/preferences';

const run = (fn: () => Promise<void>) => {
  if (Platform.OS === 'web' || !getPreferences().haptics) return;
  fn().catch(() => {
    // Some devices have no haptic engine. Never surface that.
  });
};

export const haptics = {
  /** A light tap: toggles, follow, like. */
  tap: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Choosing between options: chips, segmented controls. */
  selection: () => run(() => Haptics.selectionAsync()),
  success: () =>
    run(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    ),
  warning: () =>
    run(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    ),
  error: () =>
    run(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    ),
};
