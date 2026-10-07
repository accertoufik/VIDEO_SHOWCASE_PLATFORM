import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassIconButton } from '@/components/ui/GlassIconButton';
import { AppText } from '@/components/ui/Text';
import { colors, layout, spacing } from '@/css';

type Props = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Back goes one step inside the screen (e.g. verify -> form). Default: leave the auth screen. */
  onBack?: () => void;
};

// Flat dark page: back chevron, big title, a short subtitle, the form, and the footer link pinned to the bottom.
export const AuthShell = ({ title, subtitle, children, footer, onBack }: Props) => {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const back = onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')));

  return (
    <View style={styles.root}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl },
          ]}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.back}>
            <GlassIconButton icon='chevron-back' label='Back' variant='plain' onPress={back} />
          </View>

          <View style={styles.header}>
            <AppText variant='h1' accessibilityRole='header'>
              {title}
            </AppText>
            <AppText variant='bodySmall' color='secondary'>
              {subtitle}
            </AppText>
          </View>

          <View style={styles.form}>{children}</View>

          <View style={styles.spacer} />
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: layout.screenPadding,
    width: '100%',
    // A comfortable form width on tablets (the full 720 made the inputs and code boxes sprawl).
    maxWidth: 440,
    alignSelf: 'center',
  },
  back: { alignItems: 'flex-start', marginLeft: -spacing.sm },
  header: { gap: spacing.xs, marginTop: spacing.lg, marginBottom: spacing.xl },
  form: { gap: spacing.md },
  spacer: { flexGrow: 1, minHeight: spacing.xl },
  footer: { alignItems: 'center', gap: spacing.sm },
});
