import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addComment, deleteComment } from '@/api/social';
import { useMe } from '@/hooks/queries/useMe';
import { useApi } from '@/lib/auth/useApi';
import { queryKeys } from '@/lib/query/queryKeys';
import type { Comment } from '@/types/social';
import { patchVideoCache, withCount } from './videoCache';

const insertComment = (list: Comment[], comment: Comment): Comment[] =>
  comment.parentCommentId
    ? list.map((thread) =>
        thread.id === comment.parentCommentId
          ? { ...thread, replies: [...thread.replies, comment] }
          : thread,
      )
    : [comment, ...list];

const removeComment = (list: Comment[], id: string): Comment[] =>
  list
    .filter((thread) => thread.id !== id)
    .map((thread) => ({
      ...thread,
      replies: thread.replies.filter((reply) => reply.id !== id),
    }));

/** How many comments the server will drop: a top-level comment takes its replies with it. */
const removedCount = (list: Comment[], id: string): number => {
  const thread = list.find((t) => t.id === id);
  if (thread) return 1 + thread.replies.length;
  return list.some((t) => t.replies.some((r) => r.id === id)) ? 1 : 0;
};

const replaceComment = (
  list: Comment[],
  tempId: string,
  comment: Comment,
): Comment[] =>
  list.map((thread) =>
    thread.id === tempId
      ? { ...comment, replies: thread.replies }
      : {
          ...thread,
          replies: thread.replies.map((reply) =>
            reply.id === tempId ? comment : reply,
          ),
        },
  );

/** Optimistic ids start with this; they never exist on the server, so they can't be deleted yet. */
export const TEMP_COMMENT_PREFIX = 'temp-';

export const useAddComment = (videoId: string) => {
  const api = useApi();
  const qc = useQueryClient();
  const profile = useMe().data?.profile;

  return useMutation({
    mutationFn: (input: { body: string; parentCommentId?: string }) =>
      addComment(api, videoId, input),
    // Show the comment the instant the button is touched. Waiting for the server (a second or more) made it look
    // as if nothing had happened, so people tapped again and posted it twice.
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: queryKeys.comments(videoId) });
      const previous = qc.getQueryData<Comment[]>(queryKeys.comments(videoId));
      const tempId = `${TEMP_COMMENT_PREFIX}${Date.now()}`;
      const pending: Comment = {
        id: tempId,
        parentCommentId: input.parentCommentId ?? null,
        body: input.body,
        createdAt: new Date().toISOString(),
        isMine: true,
        author: {
          username: profile?.username ?? null,
          displayName: profile?.displayName ?? 'You',
          avatarUrl: profile?.avatarUrl ?? null,
        },
        replies: [],
      };
      qc.setQueryData<Comment[]>(queryKeys.comments(videoId), (old) =>
        insertComment(old ?? [], pending),
      );
      patchVideoCache(qc, videoId, (data) => ({
        ...data,
        video: {
          ...data.video,
          commentCount: withCount(data.video.commentCount, 1),
        },
      }));
      return { previous, tempId };
    },
    onSuccess: (comment, _input, context) => {
      // Swap the placeholder for the real comment (real id, server timestamp).
      qc.setQueryData<Comment[]>(queryKeys.comments(videoId), (old) =>
        old && context ? replaceComment(old, context.tempId, comment) : old,
      );
    },
    onError: (_error, _input, context) => {
      if (context)
        qc.setQueryData(queryKeys.comments(videoId), context.previous);
      qc.invalidateQueries({ queryKey: queryKeys.video(videoId) });
    },
  });
};

export const useDeleteComment = (videoId: string) => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(api, commentId),
    onMutate: async (commentId) => {
      await qc.cancelQueries({ queryKey: queryKeys.comments(videoId) });
      const previous = qc.getQueryData<Comment[]>(queryKeys.comments(videoId));
      const removed = previous ? removedCount(previous, commentId) : 0;
      qc.setQueryData<Comment[]>(queryKeys.comments(videoId), (old) =>
        old ? removeComment(old, commentId) : old,
      );
      patchVideoCache(qc, videoId, (data) => ({
        ...data,
        video: {
          ...data.video,
          commentCount: withCount(data.video.commentCount, -removed),
        },
      }));
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous)
        qc.setQueryData(queryKeys.comments(videoId), context.previous);
      qc.invalidateQueries({ queryKey: queryKeys.video(videoId) });
    },
  });
};
