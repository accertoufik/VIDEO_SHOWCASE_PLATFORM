import { colors } from './colors';

// Glass = blur + translucent fill + thin border (+ optional prism glow). Three strengths, used as a hierarchy.
export const blurIntensity = { subtle: 25, medium: 45, strong: 70 } as const;
export type GlassVariant = keyof typeof blurIntensity;

export const glassFill: Record<GlassVariant, string> = {
  subtle: colors.surface.glass,
  medium: colors.surface.glassMedium,
  strong: colors.surface.glassStrong,
};

export const glassBorder: Record<GlassVariant, string> = {
  subtle: colors.surface.border,
  medium: colors.surface.border,
  strong: colors.surface.borderStrong,
};

// A soft lime glow behind hero surfaces. Use sparingly.
export const prismGradient = {
  colors: [colors.accent.primarySoft, 'transparent', 'transparent'] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
};
