import { useClerk, useSSO } from '@clerk/clerk-expo';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
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
  const router = useRouter();
  const [busy, setBusy] = useState<Provider | null>(null);

  // Android: pre-start the Chrome Custom Tab so the Google page opens fast and hands the result back reliably.
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync().catch(() => {});
    return () => {
      void WebBrowser.coolDownAsync().catch(() => {});
    };
  }, []);

  const start = async (strategy: Provider) => {
    if (busy) return;
    setBusy(strategy);
    onError?.(null);
    // Android sometimes reports the browser as "cancel" even though the redirect brought the app back, so the
    // hook never sees the one-time token. Catch the redirect link ourselves as a backup.
    let redirectedUrl: string | null = null;
    const linkSub = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('rotating_token_nonce')) redirectedUrl = url;
    });
    try {
      const { createdSessionId, setActive, signIn, signUp, authSessionResult } = await startSSOFlow({
        strategy,
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        return;
      }

      // Android reports "dismiss" the moment the browser closes, which can be just BEFORE the redirect link is
      // delivered to the app. Give the link a moment to arrive (also check the link that last opened the app).
      if (authSessionResult?.type !== 'success' && !redirectedUrl) {
        for (let i = 0; i < 15 && !redirectedUrl; i++) {
          await new Promise((r) => setTimeout(r, 200));
        }
        if (!redirectedUrl) {
          const last = (await Linking.getInitialURL().catch(() => null)) ?? Linking.getLinkingURL?.() ?? null;
          if (last?.includes('rotating_token_nonce')) redirectedUrl = last;
        }
      }

      // The hook missed the redirect but we caught it: finish the sign-in with the token from that link.
      if (redirectedUrl && authSessionResult?.type !== 'success' && signIn) {
        const nonce = new URL(redirectedUrl).searchParams.get('rotating_token_nonce') ?? '';
        const reloaded = await signIn.reload({ rotatingTokenNonce: nonce });
        if (reloaded.status === 'complete' && reloaded.createdSessionId && setActive) {
          await setActive({ session: reloaded.createdSessionId });
          return;
        }
        if (reloaded.firstFactorVerification?.status === 'transferable' && signUp) {
          const moved = await signUp.create({ transfer: true });
          if (moved.createdSessionId && setActive) {
            await setActive({ session: moved.createdSessionId });
            return;
          }
        }
      }

      // No session yet. Clerk may need one more step; handle each case instead of silently doing nothing.
      // 1) The Google account has no Tamasa account yet (or the reverse): Clerk asks us to "transfer" the attempt.
      if (signIn?.firstFactorVerification?.status === 'transferable' && signUp) {
        const moved = await signUp.create({ transfer: true });
        if (moved.createdSessionId && setActive) {
          await setActive({ session: moved.createdSessionId });
          return;
        }
      }
      if (signUp?.verifications?.externalAccount?.status === 'transferable' && signIn) {
        const moved = await signIn.create({ transfer: true });
        if (moved.createdSessionId && setActive) {
          await setActive({ session: moved.createdSessionId });
          return;
        }
      }
      // 2) An existing account that needs a verification code (new device, two-step): continue on the sign-in screen.
      if (authSessionResult?.type === 'success' && signIn && ['needs_second_factor', 'needs_first_factor', 'needs_client_trust'].includes(signIn.status ?? '')) {
        router.replace({ pathname: '/sign-in', params: { resume: '1' } });
        return;
      }
      // 3) A new account that Clerk says is missing details.
      if (signUp?.status === 'missing_requirements') {
        onError?.('We need a bit more information to finish creating your account. Please sign up with email instead.');
        return;
      }
      // 4) The browser was closed, cancelled, or never handed the result back. Say so (with the reason) instead of
      // silently doing nothing, unless the user plainly backed out.
      onError?.("Sign-in didn't finish. Please try again.");
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
      linkSub.remove();
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
