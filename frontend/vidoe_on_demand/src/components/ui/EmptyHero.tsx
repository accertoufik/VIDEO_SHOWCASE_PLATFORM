import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radii, spacing } from '@/css';
import { GlassButton } from './GlassButton';
import { AppText } from './Text';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  icon: IconName;
  title: string;
  message?: string;
  action?: { label: string; icon?: IconName; onPress: () => void };
};

/** A friendlier empty screen: a ringed icon tile, a title, a short message and (optionally) one clear next step. */
export const EmptyHero = ({ icon, title, message, action }: Props) => (
  <View style={styles.root}>
    <View style={styles.ring}>
      <View style={styles.tile}>
        <Ionicons name={icon} size={32} color={colors.accent.text} />
      </View>
    </View>
    <View style={styles.text}>
      <AppText variant='h3' style={styles.center}>
        {title}
      </AppText>
      {message ? (
        <AppText variant='bodySmall' color='secondary' style={styles.center}>
          {message}
        </AppText>
      ) : null}
    </View>
    {action ? <GlassButton label={action.label} icon={action.icon} variant='primary' onPress={action.onPress} /> : null}
  </View>
);

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: spacing.xl,
    paddingVertical: spacing.section,
    paddingHorizontal: spacing.xxl,
  },
  ring: {
    width: 112,
    height: 112,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.surface.borderStrong,
    backgroundColor: colors.accent.primarySoft,
  },
  tile: {
    width: 72,
    height: 72,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.elevated,
  },
  text: { gap: spacing.xs, alignItems: 'center', maxWidth: 320 },
  center: { textAlign: 'center' },
});
