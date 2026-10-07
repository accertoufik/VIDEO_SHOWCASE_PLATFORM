import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { BRAND_NAME, TamasaWordmark } from '@/components/brand/TamasaWordmark';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';

// The brand-first splash: play mark, wordmark and tagline on dark navy, with a soft purple glow rising from the bottom.
export const FullScreenLoader = () => (
  <View style={styles.root} accessibilityRole='progressbar' accessibilityLabel={`Loading ${BRAND_NAME}`}>
    <LinearGradient
      pointerEvents='none'
      colors={['transparent', colors.accent.primarySoft, colors.accent.glow]}
      style={styles.glow}
    />
    <View style={styles.mark}>
      <Ionicons name='play' size={30} color={colors.text.inverse} />
    </View>
    <TamasaWordmark size={40} />
    <AppText variant='bodySmall' color='accent'>
      Watch. Create. Belong.
    </AppText>
  </View>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.background.primary,
  },
  glow: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '28%' },
  mark: {
    width: 68,
    height: 68,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.primary,
  },
});
