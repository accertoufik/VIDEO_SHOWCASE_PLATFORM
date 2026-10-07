import { useAuth } from '@clerk/clerk-expo';
import { useMemo, useRef } from 'react';
import { createApi } from '@/api/client';

/**
 * The ONLY way components/hooks get an API client. It always asks Clerk for a
 * fresh token per request (never cached in our code, never hard-coded).
 * The returned object is stable across renders, so it is safe in query keys' closures.
 */

export const useApi = () => {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  return useMemo(
    () =>
      createApi((options) =>
        getTokenRef.current(
          options?.skipCache ? { skipCache: true } : undefined,
        ),
      ),
    [],
  );
};
