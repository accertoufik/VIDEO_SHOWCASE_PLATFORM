import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { colors, typography } from '@/css';

/** The brand name as drawn in the design. Change it here and the wordmark, loader and accessibility label follow. */
export const BRAND_NAME = 'TAMASA';

type Props = { size?: number; color?: string; style?: StyleProp<TextStyle> };

/** The wordmark, in Bitcount Ink (the dotted display font). The only place, with brand moments, that font is used. */
export const TamasaWordmark = ({ size = 28, color = colors.text.primary, style }: Props) => (
  <Text
    accessibilityRole='header'
    accessibilityLabel={BRAND_NAME}
    allowFontScaling={false}
    style={[typography.brand, styles.text, { fontSize: size, lineHeight: size * 1.2, color }, style]}
  >
    {BRAND_NAME}
  </Text>
);

const styles = StyleSheet.create({ text: { includeFontPadding: false } });
