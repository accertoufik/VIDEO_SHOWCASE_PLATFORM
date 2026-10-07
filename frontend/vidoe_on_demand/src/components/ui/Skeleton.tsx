import { useEffect } from 'react';
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, motion, radii } from '@/css';

type Props = {
  width?: DimensionValue;
  height?: DimensionValue;
  radius?: keyof typeof radii;
  style?: StyleProp<ViewStyle>;
};

// Calm pulse (not a sweeping shimmer) so loading states don't compete with video content.
export const Skeleton = ({
  width = '100%',
  height = 16,
  radius = 'sm',
  style,
}: Props) => {
  const opacity = useSharedValue(0.55);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    opacity.value = withRepeat(
      withTiming(1, { duration: motion.slow * 2 }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [reduced, opacity]);

  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility='no-hide-descendants'
      style={[
        {
          width,
          height,
          borderRadius: radii[radius],
          backgroundColor: colors.surface.glassMedium,
        },
        animated,
        style,
      ]}
    />
  );
};
