import { Ionicons } from '@expo/vector-icons';
import { haptics } from '@/lib/haptics';
import { useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { colors, radii, spacing } from '@/css';
import { AppText, textColors } from './Text';
import { PressableScale } from './PressableScale';

type IconName = ComponentProps<typeof Ionicons>['name'];

const sizes = {
  sm: { height: 36, paddingHorizontal: spacing.lg, icon: 16 },
  md: { height: 44, paddingHorizontal: spacing.xl, icon: 18 },
  lg: { height: 52, paddingHorizontal: spacing.xxl, icon: 20 },
} as const;

const variants = {
  primary: {
    backgroundColor: colors.accent.primary,
    borderColor: 'transparent',
    fg: 'inverse',
  },
  glass: {
    backgroundColor: colors.surface.glassMedium,
    borderColor: colors.surface.border,
    fg: 'primary',
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    fg: 'primary',
  },
  danger: {
    backgroundColor: colors.status.errorSoft,
    borderColor: 'transparent',
    fg: 'error',
  },
} as const;

type Props = {
  label: string;
  onPress?: () => void;
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  haptic?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export const GlassButton = ({
  label,
  onPress,
  variant = 'glass',
  size = 'md',
  icon,
  loading = false,
  disabled = false,
  fullWidth = false,
  haptic = true,
  accessibilityLabel,
  style,
}: Props) => {
  const [pressed, setPressed] = useState(false);
  const v = variants[variant];
  const s = sizes[size];
  const inactive = disabled || loading;
  // A disabled primary button becomes a muted dark surface instead of a faded lime one.
  const mutedPrimary = variant === 'primary' && disabled && !loading;
  const fg = mutedPrimary ? textColors.muted : textColors[v.fg];

  const handlePress = () => {
    if (haptic)
      haptics.tap();
    onPress?.();
  };

  return (
    <PressableScale
      onPress={handlePress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={inactive}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={size === 'sm' ? { top: 4, bottom: 4 } : undefined}
      style={[
        styles.base,
        {
          height: s.height,
          paddingHorizontal: s.paddingHorizontal,
          // Primary goes to the darker purple while pressed.
          backgroundColor: mutedPrimary
            ? colors.surface.soft
            : variant === 'primary' && pressed
              ? colors.accent.pressed
              : v.backgroundColor,
          borderColor: v.borderColor,
        },
        fullWidth && styles.full,
        disabled && !mutedPrimary && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size='small' color={fg} />
      ) : icon ? (
        <Ionicons name={icon} size={s.icon} color={fg} />
      ) : null}
      <AppText variant='button' color={mutedPrimary ? 'muted' : v.fg}>
        {label}
      </AppText>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  full: { alignSelf: 'stretch' },
  disabled: { opacity: 0.45 },
});
