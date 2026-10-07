import type { TextStyle } from 'react-native';
import { fonts } from './fonts';

// Change a size/weight here and every screen follows. Weight comes from the font family (no fontWeight), which is
// what keeps Open Sans crisp on Android instead of synthetically bolded.
export const typography = {
  display: { fontFamily: fonts.bold, fontSize: 34, lineHeight: 42 },
  h1: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 36 },
  h2: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 29 },
  h3: { fontFamily: fonts.semibold, fontSize: 18, lineHeight: 25 },
  title: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22 },
  bodySmall: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  caption: { fontFamily: fonts.regular, fontSize: 11, lineHeight: 16 },
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 17 },
  button: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 19 },
  nav: { fontFamily: fonts.medium, fontSize: 11, lineHeight: 14 },
  /** The Tamasa wordmark and big brand moments only. */
  brand: { fontFamily: fonts.brand, fontSize: 30, lineHeight: 36, letterSpacing: 1 },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
