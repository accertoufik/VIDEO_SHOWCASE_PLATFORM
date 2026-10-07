import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '@/css';
import { GlassButton } from './GlassButton';
import { AppText } from './Text';

type IconName = keyof typeof Ionicons.glyphMap;
type Props = {
  icon: IconName;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
};

export const EmptyNotice = ({ icon, title, message, action }: Props) => (
  <View style={styles.root}>
    <Ionicons name={icon} size={32} color={colors.text.muted} />
    <AppText variant='title'>{title}</AppText>
    {message ? (
      <AppText variant='body' color='secondary' style={styles.centered}>
        {message}
      </AppText>
    ) : null}
    {action ? (
      <GlassButton label={action.label} variant='glass' onPress={action.onPress} />
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  centered: { textAlign: 'center' },
});
