import { prisma } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { cached } from "../cache/cache.service";
import { CACHE_TTL } from "../cache/cache.service";
import { cacheKeys } from "../cache/cache.keys";

export const CategoryService = {
    /** List all categories */
    listAll: async () => {
        try {
            return await cached(cacheKeys.categories(), CACHE_TTL.categories, () =>
                prisma.category.findMany({ orderBy: { name: 'asc' } }),
            );
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, 'Failed to fetch categories', error);
        }
    },
};

