import { useAuth } from '@clerk/clerk-expo';
import { useCallback } from 'react';

/** Signs the user out. (Kept as a hook so screens don't depend on Clerk directly.) */
export const useSignOut = () => {
  const { signOut } = useAuth();
  return useCallback(async () => {
    await signOut();
  }, [signOut]);
};
