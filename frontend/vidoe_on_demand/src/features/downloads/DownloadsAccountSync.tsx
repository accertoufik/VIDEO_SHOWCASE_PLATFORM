import { useAuth } from '@clerk/clerk-expo';
import { useEffect } from 'react';
import { downloadStore } from '@/lib/downloads/downloadStore';

/** Renders nothing. Points the download list at whichever account is signed in, so downloads are per account. */
export const DownloadsAccountSync = () => {
  const { isLoaded, userId } = useAuth();
  useEffect(() => {
    if (isLoaded) downloadStore.setUser(userId ?? null);
  }, [isLoaded, userId]);
  return null;
};
