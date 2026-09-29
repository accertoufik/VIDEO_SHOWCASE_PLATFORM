import { prisma } from "../config/db";
import { ApiError } from "../middleware/errorHandler";

export const CategoryService = {
    /** List all categories */
    listAll: async () => {
        try {
            const categories = await prisma.category.findMany({
                orderBy: { name: 'asc' },
            });
            return categories;
        } catch (error) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(500, 'Failed to fetch categories', error);
        }
    },
};

