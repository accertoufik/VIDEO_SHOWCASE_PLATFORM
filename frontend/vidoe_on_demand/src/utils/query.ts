export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/** builds "?a=1&b=2", skipping undefined and null values */
export const buildQuery = (params: QueryParams): string => {
    if(!params || Object.keys(params).length === 0) {
        return '';
    }
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            search.set(key, String(value));
        }
    }
    return search.toString() ? `?${search.toString()}` : '';
};

/** "/api/feed" + {limit: 20, cursor: undefined} -> "/api/feed?limit=20". Skips empty values. */
export const withQuery = (path: string, params: Record<string, string | number | boolean | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
};