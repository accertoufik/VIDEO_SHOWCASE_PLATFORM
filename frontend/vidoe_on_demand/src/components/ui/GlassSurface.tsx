import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  blurIntensity,
  colors,
  glassBorder,
  glassFill,
  prismGradient,
  radii,
  type GlassVariant,
} from '@/css';
import { useReduceTransparency } from '@/lib/a11y/useReduceTransparency';

type Props = {
  variant?: GlassVariant;
  radius?: keyof typeof radii;
  /** Adds the soft violet/cyan prism light. Hero cards, studio header, selected states only. */
  glow?: boolean;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

// The one glass recipe. Screens never build their own blur/border/fill.
export const GlassSurface = ({
  variant = 'subtle',
  radius = 'lg',
  glow = false,
  children,
  style,
}: Props) => {
  // iOS "Reduce Transparency": a solid surface (no live blur, no see-through fill), so text stays readable.
  const solid = useReduceTransparency();
  if (solid)
    return (
      <View
        style={[
          styles.base,
          styles.solid,
          { borderRadius: radii[radius], borderColor: colors.surface.borderStrong },
          style,
        ]}
      >
        {children}
      </View>
    );

  return (
  <View
    style={[
      styles.base,
      { borderRadius: radii[radius], borderColor: glassBorder[variant] },
      style,
    ]}
  >
    {Platform.OS === 'android' ? (
      // Android's live blur re-captures everything behind it on each repaint, so a TextInput inside the card
      // (e.g. typing a password) flickers. Use a solid dark fill there instead.
      <View pointerEvents='none' style={[StyleSheet.absoluteFill, styles.androidFill]} />
    ) : (
      <BlurView
        intensity={blurIntensity[variant]}
        tint='dark'
        style={StyleSheet.absoluteFill}
      />
    )}
    <View
      pointerEvents='none'
      style={[StyleSheet.absoluteFill, { backgroundColor: glassFill[variant] }]}
    />
    {glow ? (
      <LinearGradient
        pointerEvents='none'
        colors={prismGradient.colors}
        start={prismGradient.start}
        end={prismGradient.end}
        style={StyleSheet.absoluteFill}
      />
    ) : null}
    {children}
  </View>
  );
};

const styles = StyleSheet.create({
  base: { overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  androidFill: { backgroundColor: colors.overlay.glassFlat },
  solid: { backgroundColor: colors.background.elevated, borderWidth: StyleSheet.hairlineWidth },
});
