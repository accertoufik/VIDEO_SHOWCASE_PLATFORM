import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db";
import { authenticateUser, type AuthenticatedRequest } from "../middleware/auth";
import { sendSuccessResponse } from "../lib/apiResponse";
import { asyncHandler } from "../lib/asyncHandler";
import { ApiError } from "../middleware/errorHandler";
import {UserService } from "../services/user.service";
import { signImage } from "../lib/signImage";


const ME_INCLUDE = {
    profile: { include: { avatarAsset: true } },
    creatorProfile: { include: { bannerAsset: true } },
    settings: true,
} as const;

export const meRouter = Router();

meRouter.get("/me",
    authenticateUser,
    asyncHandler( async (req: AuthenticatedRequest, res) => {
    const clerkUserId = req.auth?.userId;
    if (!clerkUserId) {
        throw new ApiError(401, "Unauthorized");
    }

    try {
        let user = await prisma.user.findUnique({
            where: { clerkUserId: clerkUserId },
            //update: {},
            include: ME_INCLUDE,
        });
        
        if (!user) {
            await UserService.ensureUserWithProfile({ id: clerkUserId });
            user = await prisma.user.findUnique({
                where: { clerkUserId: clerkUserId },
                include: ME_INCLUDE,
            });
        }
        if (!user) throw new ApiError(404, "User not found");

        // Signed urls so the app can show the pictures without knowing about blob paths.
        const [avatarUrl, bannerUrl] = await Promise.all([
            signImage(user.profile?.avatarAsset?.blobPath),
            signImage(user.creatorProfile?.bannerAsset?.blobPath),
        ]);
        // Accounts created by email sign-up get a placeholder profile whose handle is the Clerk id
        // (see UserService.ensureUserWithProfile). That means "hasn't set up their profile yet".
        const followingCount = await prisma.follow.count({ where: { followerId: user.id } });
        const needsOnboarding = !user.profile || user.profile.username === clerkUserId;
        // Replace the raw asset rows (they carry storage paths) with the signed urls.
        const { avatarAsset: _avatar, ...profile } = user.profile ?? ({} as NonNullable<typeof user.profile>);
        const { bannerAsset: _banner, ...creatorProfile } = user.creatorProfile ?? ({} as NonNullable<typeof user.creatorProfile>);
        sendSuccessResponse(res, {
            user: {
                ...user,
                profile: user.profile ? { ...profile, avatarUrl } : null,
                creatorProfile: user.creatorProfile ? { ...creatorProfile, bannerUrl } : null,
                needsOnboarding,
                followingCount,
            },
        });
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(500, "Failed to fetch user data", error);
    }
})
);

const settingsSchema = z.object({ pushNotifications: z.boolean() });

/** PATCH /api/me/settings { pushNotifications } -- the only setting the backend currently enforces. */
meRouter.patch(
    "/me/settings",
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const clerkUserId = req.auth?.userId;
        if (!clerkUserId) throw new ApiError(401, "Unauthorized");

        const parsed = settingsSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ApiError(400, "Invalid settings update", z.treeifyError(parsed.error).properties);
        }

        const user = await prisma.user.findUnique({ where: { clerkUserId } });
        if (!user) throw new ApiError(404, "User not found");

        const settings = await prisma.userSettings.upsert({
            where: { userId: user.id },
            update: parsed.data,
            create: { userId: user.id, ...parsed.data },
        });
        sendSuccessResponse(res, { settings });
    }),
);


/** DELETE /api/me -- permanently deletes the caller's own account (see UserService.deleteAccount). */
meRouter.delete(
    "/me",
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const clerkUserId = req.auth?.userId;
        if (!clerkUserId) throw new ApiError(401, "Unauthorized");
        await UserService.deleteAccount(clerkUserId);
        sendSuccessResponse(res, { deleted: true });
    }),
);
