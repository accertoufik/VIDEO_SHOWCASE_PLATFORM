import type { ReactNode } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { motion } from '@/css';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  children?: ReactNode;
};

// Shared press feedback (subtle scale). Respects the OS "reduce motion" setting.
export const PressableScale = ({
  scaleTo = motion.pressScale,
  style,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Props) => {
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole='button'
      {...rest}
      style={[animatedStyle, style]}
      onPressIn={(event) => {
        if (!reduced) scale.value = withSpring(scaleTo, motion.spring);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!reduced) scale.value = withSpring(1, motion.spring);
        onPressOut?.(event);
      }}
    >
      {children}
    </AnimatedPressable>
  );
};
