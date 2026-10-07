import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { haptics } from '@/lib/haptics';
import type { ComponentProps } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii } from '@/css';
import { PressableScale } from './PressableScale';

type IconName = ComponentProps<typeof Ionicons>['name'];

const sizes = {
  sm: { box: 36, icon: 18 },
  md: { box: 44, icon: 22 },
  lg: { box: 52, icon: 26 },
} as const;

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

type Props = {
  icon: IconName;
  /** Use a Material icon instead (e.g. 'replay-5' / 'forward-5', which Ionicons doesn't have). `icon` is then ignored. */
  materialIcon?: MaterialIconName;
  /** Required: icon-only buttons need a spoken label. */
  label: string;
  onPress?: () => void;
  /** Fires on touch-down. For buttons that sit above a keyboard, which can move the button before the finger lifts. */
  onPressIn?: () => void;
  size?: keyof typeof sizes;
  /** "glass" has a translucent disc; "plain" has none (use inside already-glass areas and in lists). */
  variant?: 'glass' | 'plain';
  active?: boolean;
  /** Red icon, for destructive actions such as clearing a list. */
  danger?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

// Plain fill, not BlurView: icon buttons repeat a lot (Shorts rail, headers) and real blur per button is costly.
export const GlassIconButton = ({
  icon,
  materialIcon,
  label,
  onPress,
  onPressIn,
  size = 'md',
  variant = 'glass',
  active = false,
  danger = false,
  disabled = false,
  style,
}: Props) => {
  const s = sizes[size];

  return (
    <PressableScale
      onPress={() => {
        haptics.tap();
        onPress?.();
      }}
      onPressIn={onPressIn}
      disabled={disabled}
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      hitSlop={size === 'sm' ? 4 : undefined}
      style={[
        styles.base,
        { width: s.box, height: s.box },
        variant === 'glass' && styles.glass,
        active && styles.active,
        disabled && styles.disabled,
        style,
      ]}
    >
      {materialIcon ? (
        <MaterialIcons
          name={materialIcon}
          size={s.icon + 4}
          color={danger ? colors.status.error : active ? colors.accent.text : colors.text.primary}
        />
      ) : (
        <Ionicons
          name={icon}
          size={s.icon}
          color={danger ? colors.status.error : active ? colors.accent.text : colors.text.primary}
        />
      )}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
  },
  glass: {
    backgroundColor: colors.surface.glassMedium,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
  },
  active: {
    backgroundColor: colors.accent.primarySoft,
    borderColor: colors.accent.primary,
  },
  disabled: { opacity: 0.45 },
});
