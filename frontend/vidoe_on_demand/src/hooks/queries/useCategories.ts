import { useQuery } from '@tanstack/react-query';
import { getCategories } from '@/api/categories';
import { useApi } from '@/lib/auth/useApi';
import { queryKeys } from '@/lib/query/queryKeys';

export const useCategories = () => {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) => getCategories(api, signal),
    staleTime: 10 * 60_000, // categories rarely change
  });
};
