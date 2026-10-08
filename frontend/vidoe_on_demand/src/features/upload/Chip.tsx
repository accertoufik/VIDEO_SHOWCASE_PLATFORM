import { hitSlopFor } from '@/lib/a11y/hitSlop';
import { haptics } from '@/lib/haptics';
import { StyleSheet } from 'react-native';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { colors, layout, radii, spacing } from '@/css';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
};

export const Chip = ({ label, selected, onPress, disabled }: Props) => (
  <PressableScale
    onPress={() => {
      haptics.selection();
      onPress();
    }}
    disabled={disabled}
    hitSlop={hitSlopFor(layout.minTouchTarget - spacing.sm)}
    accessibilityRole='radio'
    accessibilityState={{ selected, disabled }}
    accessibilityLabel={label}
    style={[styles.chip, selected && styles.selected]}
  >
    <AppText variant='label' color={selected ? 'inverse' : 'secondary'}>
      {label}
    </AppText>
  </PressableScale>
);

const styles = StyleSheet.create({
  chip: {
    minHeight: layout.minTouchTarget - spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.glassMedium,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selected: { backgroundColor: colors.accent.primary, borderColor: colors.accent.primary },
});
