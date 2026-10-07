import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Props = {
  icon: IconName;
  title: string;
  hint?: string;
  /** Not supported by the backend yet: shown dimmed with a "Soon" tag and can't be pressed. */
  soon?: boolean;
  wide?: boolean;
  onPress?: () => void;
};

export const CreateOptionCard = ({ icon, title, hint, soon = false, wide = false, onPress }: Props) => (
  <PressableScale
    onPress={onPress}
    disabled={soon}
    accessibilityRole='button'
    accessibilityLabel={soon ? `${title}, coming soon` : title}
    accessibilityState={{ disabled: soon }}
    style={[styles.card, wide ? styles.wide : styles.half, soon && styles.soon]}
  >
    <View style={styles.iconBox}>
      <Ionicons name={icon} size={22} color={soon ? colors.icon.muted : colors.accent.text} />
    </View>
    <View style={styles.text}>
      <AppText variant='title' color={soon ? 'muted' : 'primary'}>
        {title}
      </AppText>
      {hint ? (
        <AppText variant='bodySmall' color='muted'>
          {hint}
        </AppText>
      ) : null}
    </View>
    {soon ? (
      <View style={styles.tag}>
        <AppText variant='nav' color='muted'>
          Soon
        </AppText>
      </View>
    ) : null}
  </PressableScale>
);

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.base,
  },
  half: { flexGrow: 1, flexBasis: '45%' },
  wide: { width: '100%', flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  soon: { opacity: 0.6 },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.soft,
  },
  text: { gap: 2, flexShrink: 1 },
  tag: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surface.soft,
  },
});
