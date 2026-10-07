import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GlassButton } from '@/components/ui/GlassButton';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';
import type { UploadPhase } from '@/hooks/mutations/useVideoUpload';

const LABEL: Record<UploadPhase, string> = {
  idle: '',
  preparing: 'Getting ready…',
  uploading: 'Uploading your video',
  thumbnail: 'Uploading your thumbnail…',
  finalizing: 'Finishing up…',
};

type Props = { phase: UploadPhase; progress: number; onCancel: () => void };

export const UploadProgress = ({ phase, progress, onCancel }: Props) => {
  const percent = Math.round(progress * 100);
  const showBar = phase === 'uploading';

  return (
    <View style={styles.wrap} accessibilityLiveRegion='polite'>
      <AppText variant='title'>{LABEL[phase]}</AppText>

      {showBar ? (
        <View
          accessibilityRole='progressbar'
          accessibilityValue={{ min: 0, max: 100, now: percent }}
          style={styles.track}
        >
          <View style={[styles.fill, { width: `${percent}%` }]} />
        </View>
      ) : (
        <ActivityIndicator color={colors.text.primary} />
      )}

      {showBar ? (
        <AppText variant='bodySmall' color='secondary'>
          {percent}%
        </AppText>
      ) : null}
      <AppText variant='bodySmall' color='muted' style={styles.hint}>
        Keep the app open until this finishes.
      </AppText>

      {phase !== 'finalizing' ? (
        <GlassButton
          label='Cancel upload'
          variant='glass'
          onPress={onCancel}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.xxxl,
  },
  track: {
    width: '100%',
    height: 8,
    borderRadius: radii.pill,
    overflow: 'hidden',
    backgroundColor: colors.surface.glassMedium,
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.text.primary,
  },
  hint: { textAlign: 'center' },
});
