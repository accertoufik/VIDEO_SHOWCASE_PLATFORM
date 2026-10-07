import type { CategorySummary } from '@/types/video';
import type { Api } from './client';
import { toCategory } from './mappers';

export const getCategories = async (
  api: Api,
  signal?: AbortSignal,
): Promise<CategorySummary[]> => {
  // GET /api/categories sends the bare array; accept { categories: [...] } too in case that changes.
  type Raw = Array<Record<string, unknown>>;
  const data = await api.get<Raw | { categories?: Raw }>('/api/categories', {
    auth: 'none',
    signal,
  });
  const rows = Array.isArray(data) ? data : (data.categories ?? []);
  return rows.map(toCategory);
};
