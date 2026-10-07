import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Stack, usePathname } from 'expo-router';
import { FullScreenLoader } from '@/components/navigation/FullScreenLoader';
import { stackScreenOptions } from '@/components/navigation/stackScreenOptions';
import { signInHref } from '@/lib/auth/redirect';

// Signed-in users only. Anonymous visitors go to sign-in and return here afterwards.
const AppLayout = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();

  if (!isLoaded) return <FullScreenLoader />;
  if (!isSignedIn) return <Redirect href={signInHref(pathname)} />;

  return <Stack screenOptions={stackScreenOptions} />;
};

export default AppLayout;
