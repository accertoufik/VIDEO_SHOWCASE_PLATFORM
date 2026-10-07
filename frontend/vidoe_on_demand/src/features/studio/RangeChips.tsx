import { StyleSheet, View } from 'react-native';
import { Chip } from '@/features/upload/Chip';
import { spacing } from '@/css';

export const RANGES = [7, 28, 90] as const;

type Props = { days: number; onChange: (days: number) => void };

export const RangeChips = ({ days, onChange }: Props) => (
  <View style={styles.row} accessibilityRole='radiogroup'>
    {RANGES.map((d) => (
      <Chip
        key={d}
        label={`${d} days`}
        selected={days === d}
        onPress={() => onChange(d)}
      />
    ))}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
});
