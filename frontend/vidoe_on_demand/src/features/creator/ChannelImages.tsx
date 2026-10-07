import { Ionicons } from '@expo/vector-icons';
import { RemoteImage as Image } from '@/components/ui/RemoteImage';
import { StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';

// Structural: matches the 16:5 crop the picker produces.
const BANNER_ASPECT = 16 / 5;

type Props = {
  bannerUri: string | null;
  avatarUri: string | null;
  name: string;
  onPickBanner: () => void;
};

export const ChannelImages = ({
  bannerUri,
  avatarUri,
  name,
  onPickBanner,
}: Props) => (
  <View>
    <PressableScale
      onPress={onPickBanner}
      accessibilityRole='button'
      accessibilityLabel='Choose channel banner'
      style={styles.banner}
    >
      {bannerUri ? (
        <Image
          source={{ uri: bannerUri, cacheKey: bannerUri.split('?')[0] }}
          style={StyleSheet.absoluteFill}
          contentFit='cover'
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={styles.placeholder}>
          <Ionicons name='image-outline' size={24} color={colors.text.muted} />
          <AppText variant='bodySmall' color='muted'>
            Add a banner
          </AppText>
        </View>
      )}
      <View style={styles.badge}>
        <Ionicons name='pencil' size={14} color={colors.text.primary} />
      </View>
    </PressableScale>

    {/* The photo belongs to the profile (Edit profile), so it is shown here but not changed here. */}
    <View style={styles.avatarRow}>
      <Avatar uri={avatarUri} name={name || '?'} size='xl' />
    </View>
  </View>
);

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    aspectRatio: BANNER_ASPECT,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface.glassMedium,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  // Pulled up so the avatar overlaps the banner's bottom-left corner.
  avatarRow: {
    marginTop: -spacing.xxxl,
    marginLeft: spacing.lg,
    alignSelf: 'flex-start',
  },
  badge: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay.scrimStrong,
  },
});
