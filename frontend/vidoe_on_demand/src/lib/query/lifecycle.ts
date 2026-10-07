import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

let installed = false;

/** Call once, at module level in the root layout. */
export const installQueryLifecycle = () => {
  if (installed) return;
  installed = true;

  // Offline: queries pause instead of failing, and resume by themselves when the connection returns.
  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) =>
      setOnline(
        Boolean(state.isConnected) && state.isInternetReachable !== false,
      ),
    ),
  );

  // Coming back to the app counts as "focus", so stale data refreshes (the web equivalent of switching tabs).
  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (Platform.OS !== 'web') handleFocus(state === 'active');
    });
    return () => subscription.remove();
  });
};

export const useIsOnline = () =>
  useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
    () => true,
  );
