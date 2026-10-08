import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

/**
 * A playback ticket lets the VIDEO PLAYER fetch a private/unlisted video's playlists without sending the user's login.
 * (The login header can't be used: the player also sends it to storage for every segment, and Azure rejects a request
 * that carries both a signed link and an Authorization header.) The ticket is issued only to someone who passed the
 * normal visibility check, is bound to ONE video, and expires.
 */
const TTL_MS = 6 * 60 * 60 * 1000;

const sign = (videoId: string, exp: number) =>
  createHmac('sha256', env.CLERK_SECRET_KEY).update(`playback:${videoId}:${exp}`).digest('base64url');

export const issuePlaybackTicket = (videoId: string) => {
  const exp = Date.now() + TTL_MS;
  return `${exp}.${sign(videoId, exp)}`;
};

export const verifyPlaybackTicket = (videoId: string, ticket: unknown): boolean => {
  if (typeof ticket !== 'string') return false;
  const [expText, signature] = ticket.split('.');
  const exp = Number(expText);
  if (!signature || !Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = Buffer.from(sign(videoId, exp));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
};
