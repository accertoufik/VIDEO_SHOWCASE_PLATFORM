import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';
import { formatCount } from '@/utils/format';

type IconName = keyof typeof Ionicons.glyphMap;
type Props = {
  label: string;
  value: number;
  icon: IconName;
  /** Shown under the value, e.g. "+12 this period". */ hint?: string;
};

export const StatCard = ({ label, value, icon, hint }: Props) => (
  <View
    style={styles.card}
    accessible
    accessibilityLabel={`${label}: ${value}${hint ? `, ${hint}` : ''}`}
  >
    <View style={styles.head}>
      <Ionicons name={icon} size={16} color={colors.text.secondary} />
      <AppText variant='label' color='secondary'>
        {label}
      </AppText>
    </View>
    <AppText variant='h2'>{formatCount(value)}</AppText>
    {hint ? (
      <AppText variant='caption' color='muted'>
        {hint}
      </AppText>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  // Two per row.
  card: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.glassMedium,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
