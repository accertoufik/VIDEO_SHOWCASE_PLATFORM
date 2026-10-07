import { useIsFocused } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { getVideo } from '@/api/video';
import { useAppActive } from '@/hooks/useAppActive';
import { useApi } from '@/lib/auth/useApi';
import { hdPollInterval } from '@/lib/hdPolling';
import { queryKeys } from '@/lib/query/queryKeys';

type Options = {
  /** Re-check while HD renditions may still be processing. Pass true from the video screen only. */
  pollHd?: boolean;
};

/**
 * Video + the viewer's own state. Always refetched on mount: the resume position lives in `viewer.progress`
 * and a cached copy from a minute ago would resume at the wrong spot.
 */
export const useVideo = (id: string, { pollHd = false }: Options = {}) => {
  const api = useApi();
  const focused = useIsFocused();
  const appActive = useAppActive();
  // Wall-clock start of this screen visit, for the polling cap.
  const startedAt = useRef(Date.now());

  return useQuery({
    queryKey: queryKeys.video(id),
    queryFn: ({ signal }) => getVideo(api, id, signal),
    enabled: Boolean(id),
    staleTime: 0,
    refetchOnMount: 'always',
    // Off when the screen is covered or the app is backgrounded; the observer re-evaluates when they flip back.
    refetchInterval:
      pollHd && focused && appActive
        ? (query) =>
            hdPollInterval(
              query.state.data?.video,
              Date.now() - startedAt.current,
            )
        : false,
  });
};
