// import { useQuery } from "@tanstack/react-query";
import { getTrending } from "@/api/trending";
import { useApi } from "@/lib/auth/useApi";
import { queryKeys } from "@/lib/query/queryKeys";
import type { VideoType } from "@/types/video";
import { useQuery } from "@tanstack/react-query";

export const useTrending = (type: VideoType = "LONG_FORM", categoryId?: string, windowDays = 7, limit = 10) => {
  const api = useApi();
  return useQuery({
    queryKey: [...queryKeys.trending(categoryId), type, windowDays, limit] as const,
    queryFn: ({ signal }) => getTrending(api, { type, categoryId, windowDays, limit, signal }),
    staleTime: 2 * 60_000,
  });
};