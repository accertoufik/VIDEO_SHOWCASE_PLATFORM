import { Router } from 'express';
import { z } from 'zod';
import { sendSuccessResponse } from '../lib/apiResponse';
import { asyncHandler } from '../lib/asyncHandler';
import { ProfileService } from '../services/profile.service';
import { authenticateUser, type AuthenticatedRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';

export const profileRouter = Router();

profileRouter.get(
  '/users/:username',
  asyncHandler(async (req, res) => {
    const username = z.string().parse(req.params.username);
    const profile = await ProfileService.getByUserName(username);
    sendSuccessResponse(res, { profile });
  }),
);

const updateProfileSchema = z.object({
    displayName: z.string().min(1).max(80).optional(),
    biography: z.string().max(500).optional(),
}).refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
});

profileRouter.patch(
    "/profile",
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const clerkUserId = req.auth?.userId;
        if (!clerkUserId) throw new ApiError(401, "Unauthorized");

        const parsed = updateProfileSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ApiError(400, "Invalid profile update", z.treeifyError(parsed.error).properties);
        }

        const profile = await ProfileService.updateOwnProfile(clerkUserId, parsed.data);
        sendSuccessResponse(res, { profile });
    }),
);

const avatarUploadSchema = z.object({
    fileExtension: z.string().regex(/^\.\w+$/, "Invalid file extension"),
});

profileRouter.post(
    "/profile/avatar",
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const clerkUserId = req.auth?.userId;
        if (!clerkUserId) throw new ApiError(401, "Unauthorized");

        const parsed = avatarUploadSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ApiError(400, "Invalid avatar upload request", z.treeifyError(parsed.error).properties);
        }

        const result = await ProfileService.generateAvatarUploadUrl(clerkUserId, parsed.data.fileExtension);
        sendSuccessResponse(res, result);
    })
);

const confirmAvatarSchema = z.object({
    blobName: z.string().min(1),
});

profileRouter.post(
    "/profile/avatar/confirm",
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const clerkUserId = req.auth?.userId;
        if (!clerkUserId) throw new ApiError(401, "Unauthorized");

        const parsed = confirmAvatarSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ApiError(400, "Invalid avatar confirmation request", z.treeifyError(parsed.error).properties);
        }

        const result = await ProfileService.confirmAvatarUpload(clerkUserId, parsed.data.blobName);
        sendSuccessResponse(res, result);
    })
);