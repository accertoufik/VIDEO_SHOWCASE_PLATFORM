import { useAuth } from '@clerk/clerk-expo';
import { usePathname, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { signInHref } from './redirect';

/**
 * For actions that need an account (like, follow, save, comment).
 *   const ensureSignedIn = useAuthGate();
 *   const onLike = () => { if (!ensureSignedIn()) return; like(); };
 * Anonymous users get the sign-in modal, and come back to this screen afterwards.
 */
export const useAuthGate = () => {
  const { isSignedIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  return useCallback(():boolean => {
    if (isSignedIn) {
      return true;
    }

    router.push(signInHref(pathname));
    return false;
  }, [isSignedIn, pathname, router]);
};
