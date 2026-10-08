import { AccessibilityInfo, Platform } from 'react-native';

/** Speak a short message through the screen reader ("HD is now available", "Published", errors). */
export const announce = (message: string) => {
  if (Platform.OS === 'web') return;
  AccessibilityInfo.announceForAccessibility(message);
};
