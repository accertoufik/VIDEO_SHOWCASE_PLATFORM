import { useSignUp } from '@clerk/clerk-expo';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { GlassButton } from '@/components/ui/GlassButton';
import { AppText } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { AuthShell } from '@/features/auth/AuthShell';
import { SocialAuthButtons } from '@/features/auth/SocialAuthButtons';
import { clerkErrorMessage } from '@/lib/auth/clerkError';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/passwordRules';
import { useCountdown } from '@/lib/auth/useCountdown';
import { OtpInput } from '@/components/ui/OtpInput';

const SignUpScreen = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resendIn = useCountdown(45);

  const run = async (
    action: (su: NonNullable<typeof signUp>) => Promise<void>,
  ) => {
    if (!isLoaded || !signUp || loading) return;
    setLoading(true);
    setError(null);
    try {
      await action(signUp);
    } catch (e) {
      setError(clerkErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const sendCode = () =>
    run(async (signUp) => {
      await signUp.create({ emailAddress: email.trim(), password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      resendIn.restart();
      setStep('verify');
    });

  const resend = () =>
    run(async (signUp) => {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      resendIn.restart();
    });

  // `value` comes straight from the code boxes when the sixth digit is typed. The `code` state has not caught up yet at
  // that moment (it still holds five digits), which is why the first attempt said "incorrect".
  const verify = (value?: string) =>
    run(async (signUp) => {
      const attempt = await signUp.attemptEmailAddressVerification({
        code: (value ?? code).trim(),
      });
      if (attempt.status === 'complete') {
        // Verified: sign the user in right away. (Leaving a finished sign-up without activating its session is what
        // made Clerk say "already signed in" on the next sign-in.) (auth)/_layout.tsx then redirects, and the
        // onboarding popup collects the profile details.
        await setActive?.({ session: attempt.createdSessionId });
      } else {
        setError(
          'Your account needs more details. Check which fields your Clerk sign-up requires.',
        );
      }
    });

  return (
    <AuthShell
      onBack={step === 'verify' ? () => { setStep('form'); setCode(''); setError(null); } : undefined}
      title={step === 'form' ? 'Create account' : 'Check your email'}
      subtitle={
        step === 'form'
          ? 'Join to follow creators and build your library.'
          : `We sent a 6-digit code to ${email.trim()}.`
      }
      footer={
        step === 'verify' ? undefined : (
        <AppText variant='bodySmall' color='secondary'>
          Already have an account?{' '}
          <Link
            href={{
              pathname: '/sign-in',
              params: redirect ? { redirect } : {},
            }}
            replace
          >
            <AppText variant='label' color='accent'>
              Sign in
            </AppText>
          </Link>
        </AppText>
        )
      }
    >
      {step === 'form' ? (
        <>
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
            autoComplete='new-password'
            textContentType='newPassword'
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          />
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
            label='Continue'
            variant='primary'
            size='lg'
            fullWidth
            loading={loading}
            disabled={!email.trim() || password.length < MIN_PASSWORD_LENGTH}
            onPress={sendCode}
          />
          <SocialAuthButtons
            action='Sign up'
            onError={setError}
            disabled={loading}
          />
        </>
      ) : (
        <>
          <OtpInput value={code} onChange={setCode} onComplete={(full) => void verify(full)} />
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
            label='Verify and continue'
            variant='primary'
            size='lg'
            fullWidth
            loading={loading}
            disabled={code.trim().length < 6}
            onPress={() => verify()}
          />
          <GlassButton
            label={resendIn.left > 0 ? `Resend code in ${resendIn.label}` : 'Resend code'}
            variant='ghost'
            size='sm'
            fullWidth
            disabled={loading || resendIn.left > 0}
            onPress={resend}
          />
        </>
      )}
    </AuthShell>
  );
};

export default SignUpScreen;
