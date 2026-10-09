import { Ionicons } from '@expo/vector-icons';
import { RemoteImage as Image } from '@/components/ui/RemoteImage';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radii, spacing } from '@/css';
import { AppText } from '@/components/ui/Text';
import { formatDuration } from '@/utils/format';

// Structural 16:9 box. Cards reserve this space before the image loads so lists never jump.
const ASPECT_RATIO = 16 / 9;

type Props = {
  uri: string | null;
  durationMs?: number | null;
  radius?: keyof typeof radii;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

export const Thumbnail = ({
  uri,
  durationMs,
  radius = 'lg',
  style,
  children,
}: Props) => (
  <View style={[styles.box, { borderRadius: radii[radius] }, style]}>
    {uri ? (
      <Image
        // Cache by path only: the SAS query string rotates, the image doesn't.
        source={{ uri, cacheKey: uri.split('?')[0] }}
        cachePolicy='memory-disk'
        style={StyleSheet.absoluteFill}
        contentFit='cover'
        transition={180}
        recyclingKey={uri.split('?')[0]}
        accessibilityIgnoresInvertColors
      />
    ) : (
      <View style={styles.placeholder}>
        <Ionicons name='film-outline' size={28} color={colors.text.muted} />
      </View>
    )}
    {durationMs ? (
      <View style={styles.duration}>
        <AppText variant='caption'>{formatDuration(durationMs)}</AppText>
      </View>
    ) : null}
    {children}
  </View>
);

const styles = StyleSheet.create({
  box: {
    width: '100%',
    aspectRatio: ASPECT_RATIO,
    overflow: 'hidden',
    backgroundColor: colors.background.elevated,
  },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  duration: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.overlay.scrimStrong,
  },
});
