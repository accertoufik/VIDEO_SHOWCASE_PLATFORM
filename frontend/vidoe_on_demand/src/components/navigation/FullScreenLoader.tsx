import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { BRAND_NAME, TamasaWordmark } from '@/components/brand/TamasaWordmark';
import { AppText } from '@/components/ui/Text';
import { colors, spacing } from '@/css';

// The native splash (assets/images/splash-icon.png) shows this same purple tile at the centre of the screen. This
// screen takes over from it with the tile in the identical spot, then the wordmark and tagline appear underneath,
// so launching feels like one continuous screen. (The native splash can't draw text on Android 12+.)
const TILE = 105;

export const FullScreenLoader = () => (
  <View style={styles.root} accessibilityRole='progressbar' accessibilityLabel={`Loading ${BRAND_NAME}`}>
    <LinearGradient
      pointerEvents='none'
      colors={['transparent', colors.accent.primarySoft, colors.accent.glow]}
      style={styles.glow}
    />
    <View style={styles.tile}>
      <Ionicons name='play' size={46} color={colors.text.inverse} style={styles.play} />
    </View>
    <View style={styles.below}>
      <TamasaWordmark size={40} />
      <AppText variant='bodySmall' color='accent'>
        Watch. Create. Belong.
      </AppText>
    </View>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background.primary },
  glow: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '28%' },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: TILE * 0.28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.primary,
  },
  play: { marginLeft: 4 }, // a play triangle looks centred when nudged right
  // Placed under the tile without moving it: the tile stays at the exact centre of the screen.
  below: {
    position: 'absolute',
    top: '50%',
    marginTop: TILE / 2 + spacing.xl,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: spacing.sm,
  },
});
