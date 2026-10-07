import type { ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import type { GlassVariant } from '@/css';
import { spacing } from '@/css';
import { GlassSurface } from './GlassSurface';
import { PressableScale } from './PressableScale';

type Props = {
  children: ReactNode;
  variant?: GlassVariant;
  glow?: boolean;
  padding?: keyof typeof spacing;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export const GlassCard = ({
  children,
  variant = 'subtle',
  glow,
  padding = 'lg',
  onPress,
  accessibilityLabel,
  style,
}: Props) => {
  const surface = (
    <GlassSurface
      variant={variant}
      glow={glow}
      radius='lg'
      style={[{ padding: spacing[padding] }, onPress ? undefined : style]}
    >
      {children}
    </GlassSurface>
  );

  if (!onPress) return surface;

  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      {surface}
    </PressableScale>
  );
};
