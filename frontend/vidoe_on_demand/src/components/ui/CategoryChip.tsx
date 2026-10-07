import { StyleSheet } from 'react-native';
import { colors, layout, radii, spacing } from '@/css';
import { AppText } from './Text';
import { PressableScale } from './PressableScale';

type Props = { label: string; selected?: boolean; onPress?: () => void };

// Flat translucent fill (no BlurView): a horizontal row can hold many chips and blur-per-chip is expensive.
export const CategoryChip = ({ label, selected = false, onPress }: Props) => (
  <PressableScale
    onPress={onPress}
    accessibilityLabel={label}
    accessibilityState={{ selected }}
    style={[styles.base, selected ? styles.selected : styles.idle]}
  >
    <AppText variant='label' color={selected ? 'inverse' : 'secondary'}>
      {label}
    </AppText>
  </PressableScale>
);

const styles = StyleSheet.create({
  base: {
    minHeight: layout.minTouchTarget - 8,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  idle: {
    backgroundColor: colors.surface.glass,
    borderColor: colors.surface.border,
  },
  selected: {
    backgroundColor: colors.accent.primary,
    borderColor: colors.accent.primary,
  },
});
