import { withQuery } from '@/utils/query';
import { toNumber } from '@/utils/normalize';
import type { Api } from './client';

export type FollowedCreator = {
  creatorId: string;
  channelName: string;
  username: string | null;
  name: string;
  avatarUrl: string | null;
  followerCount: number;
};

export type FollowingPage = {
  creators: FollowedCreator[];
  nextCursor: string | null;
};

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' && v ? v : null);

/** GET /api/me/following -- creators the signed-in user follows, most recently followed first. */
export const getFollowing = async (
  api: Api,
  params: { cursor?: string; signal?: AbortSignal },
): Promise<FollowingPage> => {
  const data = await api.get<{ creators?: Raw[]; nextCursor?: string | null }>(
    withQuery('/api/me/following', { limit: 20, cursor: params.cursor }),
    { auth: 'required', signal: params.signal },
  );
  return {
    creators: (data.creators ?? []).map((c) => {
      const channelName = str(c.channelName) ?? 'Creator';
      return {
        creatorId: String(c.creatorId ?? ''),
        channelName,
        username: str(c.username),
        name: str(c.displayName) ?? channelName,
        avatarUrl: str(c.avatarUrl),
        followerCount: toNumber(c.followerCount, 0),
      };
    }),
    nextCursor: data.nextCursor ?? null,
  };
};
