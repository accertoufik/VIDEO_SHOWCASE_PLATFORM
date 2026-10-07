import { Router } from 'express';
import { z } from 'zod';
import { sendSuccessResponse } from '../lib/apiResponse';
import { asyncHandler } from '../lib/asyncHandler';
import { CreatorService } from '../services/creator.service';
import { authenticateUser, type AuthenticatedRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';

export const creatorRouter = Router();

const creatorProfileSchema = z.object({
    // Optional: left out, the channel is named after the account's username.
    channelName: z.string().trim().min(3).max(50).optional(),
    aboutText: z.string().max(1500).optional(),
});

// Create a new creator profile
creatorRouter.post(
    "/creator-profile",
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const clerkUserId = req.auth?.userId;
        if (!clerkUserId) throw new ApiError(401, "Unauthorized");

        const parsed = creatorProfileSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ApiError(400, "Invalid creator profile request", z.treeifyError(parsed.error).properties);
        }

        const creatorProfile = await CreatorService.becomeCreator(clerkUserId, parsed.data.channelName, parsed.data.aboutText);
        sendSuccessResponse(res, { creatorProfile });
    })
);

// patch/ update the "About" section of a creator profile
const aboutTextSchema = z.object({
    aboutText: z.string().max(1500),
});

creatorRouter.patch(
    "/creator-profile/about",
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const clerkUserId = req.auth?.userId;
        if (!clerkUserId) throw new ApiError(401, "Unauthorized");

        const parsed = aboutTextSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ApiError(400, "Invalid about text request", z.treeifyError(parsed.error).properties);
        }

        const updatedProfile = await CreatorService.updateAboutText(clerkUserId, parsed.data.aboutText);
        sendSuccessResponse(res, { updatedProfile });
    })
);

// post / update the banner image of a creator profile
const bannerImageSchema = z.object({
    fileExtension: z
    .string()
    .regex(/^[a-zA-Z0-9]{1,10}$/, 'Invalid file extension (letters/digits only, no dot)'),
});

creatorRouter.post(
    "/creator-profile/banner",
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const clerkUserId = req.auth?.userId;
        if (!clerkUserId) throw new ApiError(401, "Unauthorized");

        const parsed = bannerImageSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ApiError(400, "Invalid banner image request", z.treeifyError(parsed.error).properties);
        }

        // { uploadUrl, blobName }: the app PUTs the file to uploadUrl, then confirms with blobName.
        const ticket = await CreatorService.generateBannerUploadUrl(clerkUserId, parsed.data.fileExtension);
        sendSuccessResponse(res, ticket);
    })
);

//confirm the banner image upload and update the creator profile with the new banner image URL
const confirmBannerSchema = z.object({
    blobName: z.string().min(1),
});

creatorRouter.post(
    "/creator-profile/banner/confirm",
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const clerkUserId = req.auth?.userId;
        if (!clerkUserId) throw new ApiError(401, "Unauthorized");

        const parsed = confirmBannerSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ApiError(400, "Invalid banner confirmation request", z.treeifyError(parsed.error).properties);
        }

        const updatedProfile = await CreatorService.confirmBannerUpload(clerkUserId, parsed.data.blobName);
        sendSuccessResponse(res, { updatedProfile });
    })
);