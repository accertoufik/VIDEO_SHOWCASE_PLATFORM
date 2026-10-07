import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '@/css';
import { GlassButton } from './GlassButton';
import { GlassSurface } from './GlassSurface';
import { AppText } from './Text';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  icon?: IconName;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export const EmptyState = ({
  icon = 'film-outline',
  title,
  message,
  actionLabel,
  onAction,
}: Props) => (
  <View style={styles.wrap}>
    <GlassSurface variant='subtle' radius='pill' glow style={styles.iconDisc}>
      <View style={styles.iconInner}>
        <Ionicons name={icon} size={28} color={colors.text.secondary} />
      </View>
    </GlassSurface>
    <AppText variant='h3' style={styles.center}>
      {title}
    </AppText>
    {message ? (
      <AppText variant='body' color='secondary' style={styles.center}>
        {message}
      </AppText>
    ) : null}
    {actionLabel && onAction ? (
      <GlassButton label={actionLabel} onPress={onAction} variant='primary' />
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xxxl,
  },
  iconDisc: { width: 72, height: 72 },
  iconInner: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
