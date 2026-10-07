import type { Href } from 'expo-router';

/** Only allow in-app paths ("/video/123"); anything else (https://evil, //evil) falls back to Home. */

export const safeRedirect = (value?: string | string[] | null): Href => {
  const target = Array.isArray(value) ? value[0] : value;
  if (!target || !target.startsWith('/') || target.startsWith('//'))
    return '/' as Href;
  return target as Href;
};

/** Sign-in route that returns the user to where they were afterwards. */
export const signInHref = (redirect?: string): Href =>
  (redirect && redirect !== '/'
    ? { pathname: '/sign-in', params: { redirect } }
    : '/sign-in') as Href;