import { useRouter } from 'expo-router';
import { useCallback } from 'react';

/** Back if there is history (it's a deep link otherwise), else Home. */
export const useGoBack = () => {
  const router = useRouter();
  return useCallback(
    () => (router.canGoBack() ? router.back() : router.replace('/')),
    [router],
  );
};
