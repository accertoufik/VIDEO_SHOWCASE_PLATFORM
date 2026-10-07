import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Stack, usePathname } from 'expo-router';
import { FullScreenLoader } from '@/components/navigation/FullScreenLoader';
import { stackScreenOptions } from '@/components/navigation/stackScreenOptions';
import { Screen } from '@/components/ui/Screen';
import { ErrorState } from '@/components/ui/ErrorState';
import { useMe } from '@/hooks/queries/useMe';
import { signInHref } from '@/lib/auth/redirect';

// Creators only: signed in AND has a creator profile (from /api/me). Viewers are sent to onboarding.
const CreatorLayout = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const me = useMe();

  if (!isLoaded) return <FullScreenLoader />;
  if (!isSignedIn) return <Redirect href={signInHref(pathname)} />;
  if (me.isPending) return <FullScreenLoader />;
  if (me.isError) {
    return (
      <Screen>
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </Screen>
    );
  }
  if (!me.data.creatorProfile) return <Redirect href='/become-creator' />;

  return <Stack screenOptions={stackScreenOptions} />;
};

export default CreatorLayout;
