import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';
import type { PickedVideo } from '@/lib/media/pickVideo';
import { formatBytes, formatDuration } from '@/utils/format';

type Props = {
  video: PickedVideo | null;
  onPress: () => void;
  disabled?: boolean;
  /** The library is handing the file over; a large video takes a moment. */
  loading?: boolean;
};

export const VideoPickerCard = ({ video, onPress, disabled, loading }: Props) => (
  <PressableScale
    onPress={onPress}
    disabled={disabled || loading}
    accessibilityRole='button'
    accessibilityLabel={
      video ? 'Change selected video' : 'Choose a video to upload'
    }
    style={styles.card}
  >
    <View style={styles.icon}>
      <Ionicons
        name={video ? 'videocam' : 'cloud-upload-outline'}
        size={28}
        color={colors.text.primary}
      />
    </View>
    {loading ? (
      <View style={styles.meta}>
        <AppText variant='label'>Preparing your video…</AppText>
        <AppText variant='bodySmall' color='muted'>
          Large files take a moment. Please wait.
        </AppText>
      </View>
    ) : video ? (
      <View style={styles.meta}>
        <AppText variant='label' numberOfLines={1}>
          {video.name}
        </AppText>
        <AppText variant='bodySmall' color='muted'>
          {[
            video.durationSec != null
              ? formatDuration(video.durationSec)
              : null,
            video.sizeBytes != null ? formatBytes(video.sizeBytes) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
        <AppText variant='caption' color='secondary'>
          Tap to choose a different video
        </AppText>
      </View>
    ) : (
      <View style={styles.meta}>
        <AppText variant='label'>Choose a video</AppText>
        <AppText variant='bodySmall' color='muted'>
          From your photo library
        </AppText>
      </View>
    )}
  </PressableScale>
);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.glassMedium,
  },
  icon: {
    width: 56,
    height: 56,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.glass,
  },
  meta: { flex: 1, gap: 2 },
});
