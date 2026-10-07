import { useClerk, useSSO } from '@clerk/clerk-expo';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GlassButton } from '@/components/ui/GlassButton';
import { AppText } from '@/components/ui/Text';
import { colors, spacing } from '@/css';
import { clerkErrorMessage } from '@/lib/auth/clerkError';

// Lets the OAuth browser tab hand control back to the app after the provider redirects.
WebBrowser.maybeCompleteAuthSession();

type Provider = 'oauth_google' | 'oauth_apple';

type Props = {
  /** Shown in the button labels, e.g. "Sign up with Google". */
  action?: 'Sign up' | 'Sign in';
  onError?: (message: string | null) => void;
  disabled?: boolean;
};

/**
 * Google / Apple through Clerk SSO. On success Clerk activates the session and (auth)/_layout.tsx
 * performs the redirect, same as the email form. Both providers must be enabled in the Clerk dashboard.
 */
export const SocialAuthButtons = ({
  action = 'Sign up',
  onError,
  disabled,
}: Props) => {
  const { startSSOFlow } = useSSO();
  const clerk = useClerk();
  const [busy, setBusy] = useState<Provider | null>(null);

  const start = async (strategy: Provider) => {
    if (busy) return;
    setBusy(strategy);
    onError?.(null);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy,
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
      }
      // No session id = the user closed the browser, or Clerk needs more info; nothing to show.
    } catch (e) {
      // "Session already exists": the login is there but not active in the app. Activate it instead of showing an error.
      const code = (e as { errors?: Array<{ code?: string }> } | null)?.errors?.[0]?.code;
      const existing = clerk.client?.signedInSessions?.[0]?.id ?? clerk.client?.lastActiveSessionId;
      if (code === 'session_exists' && existing) {
        try {
          await clerk.setActive({ session: existing });
          return;
        } catch {
          /* fall through to the message */
        }
      }
      onError?.(clerkErrorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.divider}>
        <View style={styles.line} />
        <AppText variant='caption' color='muted'>
          or
        </AppText>
        <View style={styles.line} />
      </View>
      <GlassButton
        label={`${action} with Google`}
        icon='logo-google'
        variant='glass'
        size='lg'
        fullWidth
        loading={busy === 'oauth_google'}
        disabled={disabled || busy !== null}
        onPress={() => start('oauth_google')}
      />
      <GlassButton
        label={`${action} with Apple`}
        icon='logo-apple'
        variant='glass'
        size='lg'
        fullWidth
        loading={busy === 'oauth_apple'}
        disabled={disabled || busy !== null}
        onPress={() => start('oauth_apple')}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.surface.border },
});
