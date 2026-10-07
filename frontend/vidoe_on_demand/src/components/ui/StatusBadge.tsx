import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '@/css';
import { AppText, type TextColor } from './Text';

const tones = {
  neutral: { bg: colors.surface.glassMedium, fg: 'secondary' },
  accent: { bg: colors.accent.primarySoft, fg: 'accent' },
  success: { bg: colors.status.successSoft, fg: 'success' },
  warning: { bg: colors.status.warningSoft, fg: 'warning' },
  error: { bg: colors.status.errorSoft, fg: 'error' },
} as const satisfies Record<string, { bg: string; fg: TextColor }>;

export type BadgeTone = keyof typeof tones;

export const StatusBadge = ({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: BadgeTone;
}) => (
  <View style={[styles.base, { backgroundColor: tones[tone].bg }]}>
    <AppText variant='label' color={tones[tone].fg}>
      {label}
    </AppText>
  </View>
);

/** Maps backend VideoStatus to a badge. Unknown statuses fall back to a neutral label instead of crashing. */
export const videoStatusBadge = (
  status: string,
): { label: string; tone: BadgeTone } => {
  switch (status) {
    case 'UPLOADING':
      return { label: 'Uploading', tone: 'neutral' };
    case 'PROCESSING':
      return { label: 'Processing', tone: 'warning' };
    case 'READY':
      return { label: 'Ready', tone: 'success' };
    case 'PUBLISHED':
      return { label: 'Published', tone: 'accent' };
    case 'FAILED':
      return { label: 'Failed', tone: 'error' };
    default:
      return {
        label: status.charAt(0) + status.slice(1).toLowerCase(),
        tone: 'neutral',
      };
  }
};

export const videoVisibilityBadge = (
  visibility: string,
): { label: string; tone: BadgeTone } => {
  switch (visibility) {
    case 'PUBLIC':
      return { label: 'Public', tone: 'success' };
    case 'UNLISTED':
      return { label: 'Unlisted', tone: 'warning' };
    default:
      return { label: 'Private', tone: 'neutral' };
  }
};

const styles = StyleSheet.create({
  base: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
});
