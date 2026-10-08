import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '@/css';
import { GlassButton } from './GlassButton';
import { AppText } from './Text';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  icon: IconName;
  title: string;
  message?: string;
  action?: { label: string; icon?: IconName; onPress: () => void };
};

/** Empty screen: a plain icon, a title, and optionally a short message and one next step. */
export const EmptyHero = ({ icon, title, message, action }: Props) => (
  <View style={styles.root}>
    <Ionicons name={icon} size={44} color={colors.text.muted} />
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
    gap: spacing.md,
    paddingVertical: spacing.section,
    paddingHorizontal: spacing.xxl,
  },
  text: { gap: spacing.xs, alignItems: 'center', maxWidth: 320 },
  center: { textAlign: 'center' },
});
