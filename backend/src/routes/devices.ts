import { Router } from 'express';
import { z } from 'zod';
import { sendSuccessResponse } from '../lib/apiResponse';
import { asyncHandler } from '../lib/asyncHandler';
import { authenticateUser, type AuthenticatedRequest } from '../middleware/auth';
import { ApiError } from '../middleware/errorHandler';
import { DeviceService } from '../services/device.service';

export const devicesRouter = Router();

const registerSchema = z.object({
  token: z.string().min(10).max(300),
  platform: z.enum(['ios', 'android', 'web']),
});

/** POST /api/devices { token, platform } */
devicesRouter.post(
  '/devices',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = req.auth?.userId;
    if (!clerkUserId) throw new ApiError(401, 'Not authenticated');
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success)
      throw new ApiError(
        400,
        'Invalid device registration',
        z.treeifyError(parsed.error),
      );
    sendSuccessResponse(
      res,
      await DeviceService.registerDevice(clerkUserId, {
        deviceToken: parsed.data.token,
        platform: parsed.data.platform,
      }),
      201,
    );
  }),
);

const unregisterSchema = z.object({ token: z.string().min(10).max(300) });

/** DELETE /api/devices { token } — token goes in the body because it contains brackets. */
devicesRouter.delete(
  '/devices',
  authenticateUser,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const clerkUserId = req.auth?.userId;
    if (!clerkUserId) throw new ApiError(401, 'Not authenticated');
    const parsed = unregisterSchema.safeParse(req.body);
    if (!parsed.success)
      throw new ApiError(
        400,
        'Invalid request',
        z.treeifyError(parsed.error),
      );
    sendSuccessResponse(
      res,
      await DeviceService.unregisterDevice(clerkUserId, parsed.data.token),
    );
  }),
);
