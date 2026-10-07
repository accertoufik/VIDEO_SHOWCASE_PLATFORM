import { useAuth } from "@clerk/clerk-expo";
import { Href } from "expo-router";
import { useMe } from "@/hooks/queries/useMe";
import { signInHref } from "./redirect";

/**
 * Where the dock's "+" button should go:
 *   signed out        -> sign-in (returns to /create afterwards)
 *   signed in viewer  -> become-creator onboarding
 *   creator           -> the Create surface
 * `loading` is true while we still don't know (auth or /api/me loading).
 */

export const useCreateDestination = (): { href: Href; loading: boolean } => {
  const { isSignedIn, isLoaded } = useAuth();
    const { data: me, isLoading: meLoading } = useMe();
    
    if (!isLoaded || meLoading) {
        return { href: '/create' as Href, loading: true };
    }

    if (!isSignedIn) {
        return { href: signInHref('/create'), loading: false };
    }

    // /api/me failed or returned nothing: fall back to the neutral /create route
    if (!me) {
        return { href: '/create' as Href, loading: false };
    }

    // Creators land on the Create surface (upload, Shorts, Studio ...).
    if (me.creatorProfile) {
        return { href: '/create' as Href, loading: false };
    }

    return { href: '/become-creator' as Href, loading: false };
};