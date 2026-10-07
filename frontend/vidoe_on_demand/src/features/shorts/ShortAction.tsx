import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { colors } from '@/css';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  /** Outline glyph, drawn with a bolder white stroke. */
  icon: IconName;
  /** Solid glyph shown (in the accent colour) while active. */
  activeIcon?: IconName;
  label: string;
  count?: string;
  active?: boolean;
  onPress: () => void;
};

const SIZE = 26;
// Ionicons has one stroke weight, so the outline is thickened by drawing the same glyph a hair off-centre in the four
// directions: the result reads as a bold white border without needing another icon set.
const NUDGES = [
  [0, 0],
  [0.7, 0],
  [-0.7, 0],
  [0, 0.7],
  [0, -0.7],
] as const;

const BoldOutline = ({ name }: { name: IconName }) => (
  <View style={styles.glyph}>
    {NUDGES.map(([dx, dy], i) => (
      <Ionicons
        key={i}
        name={name}
        size={SIZE}
        color={colors.text.primary}
        style={[styles.layer, { transform: [{ translateX: dx }, { translateY: dy }] }]}
      />
    ))}
  </View>
);

// One button of the right-hand rail, kept compact like Instagram Reels: icon with its count right under it, no discs.
export const ShortAction = ({ icon, activeIcon, label, count, active = false, onPress }: Props) => (
  <PressableScale
    onPress={onPress}
    accessibilityRole='button'
    accessibilityLabel={count ? `${label}, ${count}` : label}
    accessibilityState={{ selected: active }}
    hitSlop={6}
    style={styles.wrap}
  >
    {active && activeIcon ? (
      <Ionicons name={activeIcon} size={SIZE} color={colors.accent.text} style={styles.shadow} />
    ) : (
      <BoldOutline name={icon} />
    )}
    <AppText variant='caption' style={styles.count}>
      {count ?? label}
    </AppText>
  </PressableScale>
);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 0 },
  glyph: { width: SIZE + 2, height: SIZE + 2, alignItems: 'center', justifyContent: 'center' },
  layer: { position: 'absolute' },
  shadow: { textShadowColor: colors.overlay.scrimStrong, textShadowRadius: 5, textShadowOffset: { width: 0, height: 1 } },
  count: { marginTop: -1, textShadowColor: colors.overlay.scrimStrong, textShadowRadius: 4 },
});
