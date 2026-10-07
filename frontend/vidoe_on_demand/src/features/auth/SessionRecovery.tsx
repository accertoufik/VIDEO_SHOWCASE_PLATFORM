import { useAuth, useClerk } from '@clerk/clerk-expo';
import { useEffect } from 'react';

/**
 * Repairs the "logged out, yet Clerk says you're already signed in" state. After the app process is killed and restored
 * (very common while the photo picker is open) Clerk can reload with a valid session in its client but none ACTIVE,
 * so useAuth() reports signed out while sign-in answers "session exists". If a signed-in session is there, make it the
 * active one. A deliberate sign-out removes the session first, so this never undoes it.
 */
export const SessionRecovery = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const clerk = useClerk();

  useEffect(() => {
    if (!isLoaded || isSignedIn) return;
    const client = clerk.client;
    const session =
      client?.signedInSessions?.[0] ?? client?.sessions?.find((s) => s.status === 'active');
    if (session) void clerk.setActive({ session: session.id }).catch(() => {});
  }, [isLoaded, isSignedIn, clerk]);

  return null;
};
