import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/Text';
import { layout, spacing } from '@/css';

type Props = { title: string; actionLabel?: string; onAction?: () => void };

export const SectionHeader = ({ title, actionLabel, onAction }: Props) => (
  <View style={styles.row}>
    <AppText variant='h3' accessibilityRole='header'>
      {title}
    </AppText>
    {actionLabel && onAction ? (
      <Pressable
        onPress={onAction}
        hitSlop={10}
        accessibilityRole='button'
        accessibilityLabel={`${actionLabel} ${title}`}
      >
        <AppText variant='label' color='accent'>
          {actionLabel}
        </AppText>
      </Pressable>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
  },
});
