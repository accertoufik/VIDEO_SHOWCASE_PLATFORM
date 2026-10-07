import { Router } from 'express';
import { asyncHandler } from '../lib/asyncHandler';
import { ApiError } from '../middleware/errorHandler';
import { CategoryService } from '../services/category.service';
import { sendSuccessResponse } from '../lib/apiResponse';

export const categoryRouter = Router();

/** GET /api/categories 
 * PUBLIC, no auth required. FRONTEND: uses this to populate category buttons on home feed and the category picker in the upload form. */
categoryRouter.get(
    '/categories',
    asyncHandler(async (req, res) => {
        const categories = await CategoryService.listAll();
        sendSuccessResponse(res, categories);
    })
);

