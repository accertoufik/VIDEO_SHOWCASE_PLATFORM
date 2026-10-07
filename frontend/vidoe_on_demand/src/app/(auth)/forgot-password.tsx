import { useSignIn } from '@clerk/clerk-expo';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { GlassButton } from '@/components/ui/GlassButton';
import { AppText } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { AuthShell } from '@/features/auth/AuthShell';
import { clerkErrorMessage } from '@/lib/auth/clerkError';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/passwordRules';

// Email a code -> enter code + new password -> back to sign-in with the email filled in.
const ForgotPasswordScreen = () => {
  const { isLoaded, signIn } = useSignIn();
  const router = useRouter();
  const { redirect, email: emailParam } = useLocalSearchParams<{
    redirect?: string;
    email?: string;
  }>();
  const [email, setEmail] = useState(emailParam ?? '');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'email' | 'reset'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    if (!isLoaded || loading) return;
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(clerkErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const sendCode = () =>
    run(async () => {
      await signIn?.create({
        strategy: 'reset_password_email_code',
        identifier: email.trim(),
      });
      setStep('reset');
    });

  const resetPassword = () =>
    run(async () => {
      const attempt = await signIn?.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
        password,
      });
      if (attempt?.status === 'complete' || attempt?.status === 'needs_second_factor') {
        // Not signed in here on purpose: the user signs in once with the new password.
        router.replace({
          pathname: '/sign-in',
          params: { email: email.trim(), reset: '1', ...(redirect ? { redirect } : {}) },
        });
      } else {
        setError("We couldn't finish the reset. Try again.");
      }
    });

  return (
    <AuthShell
      title={step === 'email' ? 'Forgot password?' : 'Set a new password'}
      subtitle={
        step === 'email'
          ? "Enter your account email and we'll send you a code."
          : `Enter the code we sent to ${email.trim()} and choose a new password.`
      }
      footer={
        <Link
          href={{ pathname: '/sign-in', params: redirect ? { redirect } : {} }}
          replace
        >
          <AppText variant='title' color='accent'>
            Back to sign in
          </AppText>
        </Link>
      }
    >
      {step === 'email' ? (
        <>
          <TextField
            label='Email'
            value={email}
            onChangeText={setEmail}
            keyboardType='email-address'
            autoCapitalize='none'
            autoComplete='email'
            autoCorrect={false}
            textContentType='emailAddress'
            placeholder='you@example.com'
            onSubmitEditing={sendCode}
          />
          {error ? (
            <AppText variant='bodySmall' color='error' accessibilityLiveRegion='polite'>
              {error}
            </AppText>
          ) : null}
          <GlassButton
            label='Send code'
            variant='primary'
            size='lg'
            fullWidth
            loading={loading}
            disabled={!email.trim()}
            onPress={sendCode}
          />
        </>
      ) : (
        <>
          <TextField
            label='Verification code'
            value={code}
            onChangeText={setCode}
            keyboardType='number-pad'
            autoComplete='one-time-code'
            textContentType='oneTimeCode'
            maxLength={8}
            placeholder='123456'
          />
          <TextField
            label='New password'
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize='none'
            autoComplete='new-password'
            textContentType='newPassword'
            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
          />
          {error ? (
            <AppText variant='bodySmall' color='error' accessibilityLiveRegion='polite'>
              {error}
            </AppText>
          ) : null}
          <GlassButton
            label='Reset password'
            variant='primary'
            size='lg'
            fullWidth
            loading={loading}
            disabled={code.trim().length < 6 || password.length < MIN_PASSWORD_LENGTH}
            onPress={resetPassword}
          />
          <GlassButton
            label='Resend code'
            variant='ghost'
            fullWidth
            disabled={loading}
            onPress={sendCode}
          />
        </>
      )}
    </AuthShell>
  );
};

export default ForgotPasswordScreen;
