import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, spacing } from '@/css';
import { useGoBack } from '@/lib/navigation/useGoBack';
import { GlassIconButton } from './GlassIconButton';
import { AppText } from './Text';

type Props = { title: string; right?: ReactNode };

// Back button + title (+ optional trailing action) for stack screens that don't use a native header.
export const ScreenHeader = ({ title, right }: Props) => {
  const insets = useSafeAreaInsets();
  const goBack = useGoBack();

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.sm }]}>
      <GlassIconButton icon='chevron-back' label='Go back' onPress={goBack} />
      <AppText
        variant='h2'
        style={styles.title}
        numberOfLines={1}
        accessibilityRole='header'
      >
        {title}
      </AppText>
      {right}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
  },
  title: { flex: 1 },
});
