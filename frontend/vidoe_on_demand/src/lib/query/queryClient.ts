import { MutationCache, QueryClient } from '@tanstack/react-query';
import { describeError } from '@/lib/errors/describeError';
import { errorBus } from '@/lib/errors/errorBus';
import { retryDelay, shouldRetry } from '@/lib/query/retry';
 
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 30_000, gcTime: 5 * 60_000, retry: shouldRetry,
            retryDelay,
            refetchOnReconnect: true
        },
        mutations: {
            retry: false
        },

    },

    //Failed Mutations (like,follow,comment...) surface a message globally via the errorBus, so the UI can show a toast. This is a UX decision: we don't want to force every component to handle errors individually.
    //A mutation can opt out with meta: { silent: true } (e.g. the "delete comment" button, which has its own error handling).
    mutationCache: new MutationCache({
        onError: (error, _variables, _context, mutation) => {
            if (mutation.meta?.silent) return;
            const { message, status } = describeError(error);
            errorBus.publish({ message, status });
        }
    
    })
})