import { useAuth } from '@clerk/clerk-expo';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../lib/auth/useApi';
import { queryKeys } from '@/lib/query/queryKeys';
import { getMe } from '@/api/me';

/** signed-in user's account. Disabled for anonymous users (when no user is signed in) */
export const useMe = () => {
    const api = useApi();
    const { isSignedIn, isLoaded } = useAuth();

    return useQuery({
        queryKey: queryKeys.me,
        queryFn: () => getMe(api),
        enabled: isLoaded && Boolean(isSignedIn),
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
}