import { spacing } from './spacing';

export const layout = {
  screenPadding: spacing.lg,
  minTouchTarget: 44,
  headerHeight: 56,
  maxContentWidth: 720,
  card: { aspect: 16 / 9 },
  dock: {
    height: 66,
    bottomOffset: 14,
    horizontalMargin: 14,
    createButtonSize: 62,
  },
  /** Thickness of the white ring around the focused text box. */
  focusRingWidth: 1.5,
  avatar: { xs: 24, sm: 32, md: 40, lg: 56, xl: 88 },
} as const;
