import { prisma } from "../config/db";

interface CLerkUserData {
    id: string;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    [key : string]: unknown;
}

const buildFallbackUsername = (userData: CLerkUserData) => {
    const username = userData.username ?? userData.id;
    const displayName = [userData.first_name, userData.last_name].filter(Boolean).join(" ").trim() || username;
    return { username, displayName };
    
}

export const UserService = {
    ensureUserWithProfile: async (data: CLerkUserData) => {
        try {
            const existing = await prisma.user.findUnique({
                where: { clerkUserId: data.id },
            });

            if (existing) {
                return existing;
            }

            const { username, displayName } = buildFallbackUsername(data);

            const user = await prisma.user.create({
                data: {
                    clerkUserId: data.id,
                    profile: { create: { username, displayName } },
                    settings: { create: {} },
                
                },
            });
            return user;
        } catch (error) {
            throw new Error(
              `Failed to create user/profile for Clerk id "${data.id}": ${error}`,
            );
        }
    },

    deactivateUser: async (clerkUserId: string) => {
        try {
            const user = await prisma.user.update({
                where: { clerkUserId },
                data: { accountStatus: "DEACTIVATED", deletedAt: new Date() },
            });
            return user;
        } catch (error) {
            throw new Error(
              `Failed to deactivate user for Clerk id "${clerkUserId}": ${error}`,
            );
        }
    }
}