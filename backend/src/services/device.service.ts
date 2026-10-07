import { prisma } from '../config/db';
import { ApiError } from '../middleware/errorHandler';
import { isExpoToken } from './push.service';

export const DeviceService = {
    //idempotent: if the device already exists, update it; otherwise, create it
    registerDevice: async (clerkUserId: string, input: { deviceToken: string; platform: 'ios' | 'android' | 'web' }) => {
        const { deviceToken, platform } = input;
        try {
            if (!isExpoToken(deviceToken)) {
                throw new ApiError(400, 'Invalid device token');
            }
            const user = await prisma.user.findUnique({
                where: { clerkUserId },
                select: { id: true },
            });
            if (!user) throw new ApiError(404, 'User not found');
            const device = await prisma.deviceToken.upsert({
                where: { token: deviceToken },
                update: { userId: user.id, platform, lastSeenAt: new Date() },
                create: { token: deviceToken, platform, userId: user.id },
            });
            return { registered: true, deviceId: device.id };
        } catch (error) {
            if (error instanceof ApiError) throw error;
            throw new ApiError(500, 'Failed to register device', error);
        }   
    },


    //call on sign-out. Only removes the token if it belongs to the caller. 
    unregisterDevice: async (clerkUserId: string, deviceToken: string) => {
        try {
              const user = await prisma.user.findUnique({
                where: { clerkUserId },
                select: { id: true },
              });
              if (!user) throw new ApiError(404, 'User not found');
              const device = await prisma.deviceToken.deleteMany({
                where: { token: deviceToken, userId: user.id },
              });
              return { deleted: device.count >0 };
        } catch (error) {
            if (error instanceof ApiError) throw error;
            throw new ApiError(500, 'Failed to unregister device', error);
        }
      
    }
}