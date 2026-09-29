import { prisma } from '../config/db';
import { env } from '../config/env';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_CHUNK_SIZE = 100; // Expo's per-request maximum
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export interface PushPayload {
  title: string;
  body?: string;
  /** Deep-link data the app reads on tap, e.g. { type, videoId, creatorId }. */
  data?: Record<string, unknown>;
}

export const isExpoToken = (token: string) => EXPO_TOKEN_RE.test(token);

export const chunk = <T>(items: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
};

/** Tokens Expo says will never work again — safe to delete. */
export const findDeadTokens = (
  tokens: string[],
  tickets: Array<{ status?: string; details?: { error?: string } }>,
) =>
  tokens.filter(
    (_, i) =>
      tickets[i]?.status === 'error' &&
      tickets[i]?.details?.error === 'DeviceNotRegistered',
  );

/** NEVER throws into the caller. Use as `void PushService.sendToUsers(...)`. */
export const PushService = {
  sendToUsers: async (userIds: string[], payload: PushPayload) => {
    try {
      if (userIds.length === 0) return;

      // Respect UserSettings.pushNotifications. A missing settings row means the default (on).
      const rows = await prisma.deviceToken.findMany({
        where: {
          userId: { in: userIds },
          provider: 'EXPO',
          user: {
            OR: [
              { settings: { is: null } },
              { settings: { is: { pushNotifications: true } } },
            ],
          },
        },
        select: { token: true },
      });

      const tokens: string[] = [
        ...new Set<string>(rows.map((r: { token: string }) => r.token)),
      ].filter(isExpoToken);
      if (tokens.length === 0) return;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (env.EXPO_ACCESS_TOKEN)
        headers.Authorization = `Bearer ${env.EXPO_ACCESS_TOKEN}`;

      for (const batch of chunk(tokens, EXPO_CHUNK_SIZE)) {
        try {
          const response = await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify(
              batch.map((to) => ({
                to,
                sound: 'default',
                title: payload.title,
                body: payload.body,
                data: payload.data,
              })),
            ),
          });
          if (!response.ok) {
            console.error(`Expo push request failed: HTTP ${response.status}`);
            continue;
          }
          const json = (await response.json()) as {
            data?: Array<{ status?: string; details?: { error?: string } }>;
          };
          const dead = findDeadTokens(batch, json.data ?? []);
          if (dead.length > 0)
            await prisma.deviceToken.deleteMany({
              where: { token: { in: dead } },
            });
        } catch (error) {
          console.error('Expo push batch failed (non-fatal):', error);
        }
      }
    } catch (error) {
      console.error('PushService failed (non-fatal):', error);
    }
  },
};
