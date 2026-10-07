import { Me } from '../types/user';
import { Api } from './client';

type RawUser = Partial<Me> & Record<string, unknown>;

// The plan describes /api/me as { profile, creatorProfile, settings }; the user row may also arrive
// wrapped as { user: {...} }. Accept both so a shape difference never breaks guards.

const normalizeMe = (raw: unknown): Me => { 
    const container = (raw ?? {}) as { user?: RawUser } & RawUser;
    const user: RawUser = container.user ?? container;
    return {
        id: String(user.id ?? ''),
        role: typeof user.role === 'string' ? String(user.role) : undefined,
        profile: (user.profile as Me["profile"]) ?? null,
        creatorProfile: (user.creatorProfile as Me["creatorProfile"]) ?? null,
        settings: user.settings ?? null,
        needsOnboarding: user.needsOnboarding === true,
        followingCount: Number.isFinite(Number(user.followingCount)) ? Number(user.followingCount) : undefined,
    };

}

export const getMe = async (api: Api): Promise<Me> => { 
    return normalizeMe(await api.get<unknown>('/api/me', {auth: "required"}) );
}