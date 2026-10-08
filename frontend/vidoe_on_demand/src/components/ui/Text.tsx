import { Text, type TextProps } from "react-native";
import { colors, typography, type TypographyVariant } from "@/css";

export const textColors = {
  primary: colors.text.primary,
  secondary: colors.text.secondary,
  muted: colors.text.muted,
  inverse: colors.text.inverse,
  accent: colors.accent.text,
  success: colors.status.success,
  warning: colors.status.warning,
  error: colors.status.error,
} as const;

export type TextColor = keyof typeof textColors;

type Props = TextProps & { variant?: TypographyVariant; color?: TextColor };

// Every piece of text in the app goes through this, so type and color stay token-driven.
export const AppText = ({ variant = "body", color = "primary", style, ...rest }: Props) => (
  <Text
    // Large-text users must keep working text scaling; the cap only stops the biggest sizes breaking layouts.
    maxFontSizeMultiplier={variant === 'display' || variant === 'h1' || variant === 'brand' ? 1.2 : 1.5}
    {...rest}
    style={[typography[variant], { color: textColors[color] }, style]}
  />
);