import { prisma } from "../config/db";
import { ApiError } from "../middleware/errorHandler";
import { Router } from "express";
import { z } from "zod";
import { sendSuccessResponse } from "../lib/apiResponse";
import { asyncHandler } from "../lib/asyncHandler";
import { type AuthenticatedRequest, authenticateUser } from "../middleware/auth";
import { NotificationService } from "../services/notification.service";

export const notificationsRouter = Router();


/**
 * GET /api/notifications
 * Cursor-paginated, newest first. Also returns unreadCount so the client
 * can show a badge without a separate request.
 */

notificationsRouter.get(
    '/notifications',
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const userId = req.auth?.userId;
        if (!userId) {
            throw new ApiError(401, "Unauthorized: No user ID found in request");
        }

        const limit = Math.min(Number(req.query.limit) || 20, 50);
        const cursorParsed = z.uuid().safeParse(req.query.cursor);
        const cursor = cursorParsed.success ? cursorParsed.data : null;
        const result = await NotificationService.listMine(userId, limit, cursor);
        sendSuccessResponse(res, result);
    })
);

/**
 * PATCH /api/notifications/:notificationId/read
 * Marks a single notification as read. Idempotent — reading an
 * already-read notification just returns it unchanged.
 */
notificationsRouter.patch(
    '/notifications/:notificationId/read',
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const userId = req.auth?.userId;
        if (!userId) {
            throw new ApiError(401, "Unauthorized: No user ID found in request");
        }

        const notificationId = req.params.notificationId;
        if( typeof notificationId !== 'string') {
            throw new ApiError(400, "Invalid notification ID");
        }

        const result = await NotificationService.markRead(userId, notificationId);
        sendSuccessResponse(res, result);
    })
);

/**
 * PATCH /api/notifications/read-all
 * Marks every unread notification for the caller as read in one shot.
 */

notificationsRouter.patch(
    '/notifications/read-all',
    authenticateUser,
    asyncHandler(async (req: AuthenticatedRequest, res) => {
        const userId = req.auth?.userId;
        if (!userId) {
            throw new ApiError(401, "Unauthorized: No user ID found in request");
        }

        const result = await NotificationService.markAllRead(userId);
        sendSuccessResponse(res, result);
    })
);


