import { Router } from "express";
import { prisma } from "../config/db";
import { authenticateUser, type AuthenticatedRequest } from "../middleware/auth";
import { sendSuccessResponse } from "../lib/apiResponse";
import { asyncHandler } from "../lib/asyncHandler";
import { ApiError } from "../middleware/errorHandler";
import {UserService } from "../services/user.service";


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
            include: { profile: true, creatorProfile: true, settings: true },
        });
        
        if (!user) {
            await UserService.ensureUserWithProfile({ id: clerkUserId });
            user = await prisma.user.findUnique({
                where: { clerkUserId: clerkUserId },
                include: { profile: true, creatorProfile: true, settings: true },
            });
        }
        sendSuccessResponse(res, { user });
    } catch (error) {
        throw new ApiError(500, "Failed to fetch user data", error);
    }
})
);