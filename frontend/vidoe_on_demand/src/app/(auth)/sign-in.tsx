import { useClerk, useSignIn } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GlassButton } from '@/components/ui/GlassButton';
import { AppText } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { AuthShell } from '@/features/auth/AuthShell';
import { SocialAuthButtons } from '@/features/auth/SocialAuthButtons';
import { clerkErrorMessage } from '@/lib/auth/clerkError';
import { getRememberMe, getRememberedEmail, saveRememberMe } from '@/lib/auth/rememberMe';
import { colors } from '@/css';
import { OtpInput } from '@/components/ui/OtpInput';
import { useCountdown } from '@/lib/auth/useCountdown';

type SignInResource = NonNullable<ReturnType<typeof useSignIn>['signIn']>;

const SignInScreen = () => {
  const { isLoaded, signIn, setActive } = useSignIn();
  const clerk = useClerk();
  const {
    redirect,
    email: emailParam,
    created,
    reset,
  } = useLocalSearchParams<{
    redirect?: string;
    email?: string;
    created?: string;
    reset?: string;
  }>();
  const [email, setEmail] = useState(emailParam ?? '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const resendIn = useCountdown(45);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extra verification Clerk can ask for after the password: email/SMS code (new device, 2-step) or an authenticator code.
  const [factor, setFactor] = useState<{
    kind: 'first' | 'second';
    strategy: 'email_code' | 'phone_code' | 'totp';
    /** Needed to send the first-factor email code again. */
    emailAddressId?: string;
  } | null>(null);
  const [code, setCode] = useState('');

  // Restore the "Remember me" choice and the remembered email.
  useEffect(() => {
    void getRememberMe().then(setRemember);
    if (!emailParam) void getRememberedEmail().then((saved) => saved && setEmail((cur) => cur || saved));
  }, [emailParam]);

  const toggleRemember = () => {
    const next = !remember;
    setRemember(next);
    void saveRememberMe(next, email.trim());
  };

  const finish = async (attempt: SignInResource) => {
    if (attempt.status === 'complete') {
      // (auth)/_layout.tsx performs the redirect once the session is active.
      await setActive?.({ session: attempt.createdSessionId });
      void saveRememberMe(remember, email.trim());
      return;
    }

    if (attempt.status === 'needs_second_factor') {
      const options = attempt.supportedSecondFactors ?? [];
      const pick =
        options.find((f) => f.strategy === 'email_code') ??
        options.find((f) => f.strategy === 'phone_code') ??
        options.find((f) => f.strategy === 'totp');
      if (pick) {
        const strategy = pick.strategy;
        if (strategy !== 'totp') await attempt.prepareSecondFactor({ strategy });
        setFactor({ kind: 'second', strategy });
        resendIn.restart();
        return;
      }
    }

    if (attempt.status === 'needs_first_factor') {
      const pick = (attempt.supportedFirstFactors ?? []).find(
        (f) => f.strategy === 'email_code',
      );
      if (pick && pick.strategy === 'email_code') {
        await attempt.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: pick.emailAddressId,
        });
        setFactor({ kind: 'first', strategy: 'email_code', emailAddressId: pick.emailAddressId });
        resendIn.restart();
        return;
      }
    }

    setError(
      attempt.status === 'needs_new_password'
        ? 'This account needs a new password. Reset it from the Clerk sign-in page or ask an admin.'
        : `This account needs a verification step the app can't do yet (${attempt.status}).`,
    );
  };

  const run = async (action: () => Promise<void>) => {
    if (!isLoaded || loading) return;
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      // Clerk already holds a session for this device (it just isn't active in the app): activate it
      // instead of telling the user they are "already signed in" while the app still shows signed out.
      const code = (e as { errors?: Array<{ code?: string }> } | null)?.errors?.[0]?.code;
      const existing = clerk.client?.lastActiveSessionId ?? clerk.client?.sessions?.[0]?.id;
      if (code === 'session_exists' && existing && setActive) {
        try {
          await setActive({ session: existing });
          return;
        } catch {
          /* fall through to the message */
        }
      }
      setError(clerkErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = () =>
    run(async () => {
      if (!signIn) return;
      await finish(
        await signIn.create({ identifier: email.trim(), password }),
      );
    });

  // `value` is the full code from the boxes (the `code` state is still one digit behind when auto-submitting).
  // Send the code again (email / text). Authenticator-app codes can't be re-sent.
  const onResend = () =>
    run(async () => {
      if (!signIn || !factor || factor.strategy === 'totp') return;
      if (factor.kind === 'first') {
        if (factor.emailAddressId)
          await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId });
      } else {
        await signIn.prepareSecondFactor({ strategy: factor.strategy });
      }
      resendIn.restart();
    });

  const onVerify = (value?: string) =>
    run(async () => {
      if (!signIn || !factor) return;
      const params = { strategy: factor.strategy, code: (value ?? code).trim() } as const;
      await finish(
        factor.kind === 'first'
          ? await signIn.attemptFirstFactor(params as never)
          : await signIn.attemptSecondFactor(params as never),
      );
    });

  if (factor) {
    return (
      <AuthShell
        onBack={() => {
          setFactor(null);
          setCode('');
          setError(null);
        }}
        title='Verify it is you'
        subtitle={
          factor.strategy === 'totp'
            ? 'Enter the code from your authenticator app.'
            : factor.strategy === 'phone_code'
              ? 'Enter the code we texted you.'
              : `Enter the code we emailed to ${email.trim()}.`
        }
      >
        <OtpInput value={code} onChange={setCode} onComplete={(full) => void onVerify(full)} />
        {error ? (
          <AppText variant='bodySmall' color='error' accessibilityLiveRegion='polite'>
            {error}
          </AppText>
        ) : null}
        <GlassButton
          label='Verify and sign in'
          variant='primary'
          size='lg'
          fullWidth
          loading={loading}
          disabled={code.trim().length < 6}
          onPress={() => onVerify()}
        />
        {factor.strategy === 'totp' ? null : (
          <GlassButton
            label={resendIn.left > 0 ? `Resend code in ${resendIn.label}` : 'Resend code'}
            variant='ghost'
            size='sm'
            fullWidth
            disabled={loading || resendIn.left > 0}
            onPress={onResend}
          />
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title='Welcome back'
      subtitle='Sign in to like, comment, follow and keep your place.'
      footer={
        <AppText variant='bodySmall' color='secondary'>
          New here?{' '}
          <Link
            href={{
              pathname: '/sign-up',
              params: redirect ? { redirect } : {},
            }}
            replace
          >
            <AppText variant='label' color='accent'>
              Create an account
            </AppText>
          </Link>
        </AppText>
      }
    >
      <TextField
        label='Email'
        icon='mail-outline'
        hideLabel
        value={email}
        onChangeText={setEmail}
        keyboardType='email-address'
        autoCapitalize='none'
        autoComplete='email'
        autoCorrect={false}
        textContentType='emailAddress'
        placeholder='you@example.com'
      />
      <TextField
        label='Password'
        icon='lock-closed-outline'
        hideLabel
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize='none'
        autoComplete='current-password'
        textContentType='password'
        placeholder='Your password'
        onSubmitEditing={onSubmit}
        returnKeyType='go'
      />
      <View style={styles.optionsRow}>
      <Pressable
        onPress={toggleRemember}
        accessibilityRole='checkbox'
        accessibilityState={{ checked: remember }}
        accessibilityLabel='Remember me'
        style={styles.remember}
        hitSlop={8}
      >
        <Ionicons
          name={remember ? 'checkbox' : 'square-outline'}
          size={22}
          color={remember ? colors.accent.text : colors.text.muted}
        />
        <AppText variant='bodySmall' color='secondary'>
          Remember me
        </AppText>
      </Pressable>
      <Link
        href={{
          pathname: '/forgot-password',
          params: {
            ...(email.trim() ? { email: email.trim() } : {}),
            ...(redirect ? { redirect } : {}),
          },
        }}
        style={styles.forgot}
      >
        <AppText variant='label' color='accent'>
          Forgot password?
        </AppText>
      </Link>
      </View>
      {(created === '1' || reset === '1') && !error ? (
        <AppText variant='bodySmall' color='success'>
          {reset === '1'
            ? 'Password updated. Sign in with your new password.'
            : 'Account created. Sign in to continue.'}
        </AppText>
      ) : null}
      {error ? (
        <AppText
          variant='bodySmall'
          color='error'
          accessibilityLiveRegion='polite'
        >
          {error}
        </AppText>
      ) : null}
      <GlassButton
        label='Sign in'
        variant='primary'
        size='lg'
        fullWidth
        loading={loading}
        disabled={!email.trim() || !password}
        onPress={onSubmit}
      />
      <SocialAuthButtons
        action='Sign in'
        onError={setError}
        disabled={loading}
      />
    </AuthShell>
  );
};

export default SignInScreen;

const styles = StyleSheet.create({
  optionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  forgot: { alignSelf: 'flex-end' },
  remember: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start' },
});
