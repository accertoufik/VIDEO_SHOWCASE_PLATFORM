import { StyleSheet, View } from 'react-native';
import { colors, radii } from '@/css';

type Props = {
  percent: number;
  /** Pin to the bottom edge of a thumbnail. */ overlay?: boolean;
};

export const ProgressBar = ({ percent, overlay = false }: Props) => {
  const value = Math.min(100, Math.max(0, percent));
  return (
    <View
      style={[styles.track, overlay && styles.overlay]}
      accessibilityRole='progressbar'
      accessibilityValue={{ min: 0, max: 100, now: Math.round(value) }}
    >
      <View style={[styles.fill, { width: `${value}%` }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    height: 3,
    backgroundColor: colors.surface.borderStrong,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 0,
  },
  fill: { height: '100%', backgroundColor: colors.accent.primary },
});
