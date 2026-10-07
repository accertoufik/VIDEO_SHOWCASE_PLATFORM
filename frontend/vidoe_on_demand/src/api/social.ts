import { isApiError } from './ApiError';
import type { Api } from './client';
import { toComment } from './mappers';
import type { Comment } from '@/types/social';

type Raw = Record<string, unknown>;
const required = { auth: 'required' } as const;

/** The backend answers 409 when the state already matches (liked twice, followed twice). The user's intent is satisfied, so that's success. */
const idempotent = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    if (isApiError(error) && error.status === 409) return;
    throw error;
  }
};

export const likeVideo = (api: Api, id: string) =>
  idempotent(() => api.post(`/api/videos/${id}/like`, undefined, required));
export const unlikeVideo = (api: Api, id: string) =>
  api.del(`/api/videos/${id}/like`, undefined, required);

export const saveVideo = (api: Api, id: string) =>
  idempotent(() => api.post(`/api/videos/${id}/save`, undefined, required));
export const unsaveVideo = (api: Api, id: string) =>
  api.del(`/api/videos/${id}/save`, undefined, required);

export const followCreator = (api: Api, creatorId: string) =>
  idempotent(() =>
    api.post(`/api/creators/${creatorId}/follow`, undefined, required),
  );
export const unfollowCreator = (api: Api, creatorId: string) =>
  api.del(`/api/creators/${creatorId}/follow`, undefined, required);

/** Bumps the share counter on the server. The count is private to the owner, so nothing comes back. No sign-in needed. */
export const shareVideo = async (api: Api, id: string): Promise<void> => {
  await api.post(`/api/videos/${id}/share`, undefined, { auth: 'optional' });
};

export const getComments = async (
  api: Api,
  id: string,
  signal?: AbortSignal,
): Promise<Comment[]> => {
  const data = await api.get<{ comments?: Raw[] }>(
    `/api/videos/${id}/comments`,
    { auth: 'optional', signal },
  );
  return (data.comments ?? []).map(toComment);
};

export const addComment = async (
  api: Api,
  id: string,
  body: { body: string; parentCommentId?: string },
): Promise<Comment> => {
  const data = await api.post<{ comment?: Raw } & Raw>(
    `/api/videos/${id}/comments`,
    body,
    required,
  );
  return toComment(data.comment ?? data);
};

export const deleteComment = (api: Api, commentId: string) =>
  api.del(`/api/comments/${commentId}`, undefined, required);
