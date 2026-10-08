import {
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { deleteVideo, updateVideo } from '@/api/creatorVideos';
import { confirmThumbnail, requestThumbnailUpload } from '@/api/uploads';
import { removeStudioComment } from '@/api/studio';
import { MY_VIDEOS_KEY } from '@/hooks/queries/useMyVideos';
import { STUDIO_COMMENTS_KEY, STUDIO_KEY } from '@/hooks/queries/useStudio';
import { useApi } from '@/lib/auth/useApi';
import { uploadToBlob } from '@/lib/upload/blobUpload';
import { queryKeys } from '@/lib/query/queryKeys';
import type { PickedImage } from '@/lib/media/pickImage';
import type { StudioCommentsPage } from '@/types/studio';

type CommentsData = InfiniteData<StudioCommentsPage>;

/** Optimistic: the comment (and, for a top-level one, its replies) vanishes at once; a failure restores it. */
export const useRemoveStudioComment = () => {
  const api = useApi();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (commentId: string) => removeStudioComment(api, commentId),
    onMutate: async (commentId) => {
      await qc.cancelQueries({ queryKey: STUDIO_COMMENTS_KEY });
      const previous = qc.getQueriesData<CommentsData>({
        queryKey: STUDIO_COMMENTS_KEY,
      });
      qc.setQueriesData<CommentsData>(
        { queryKey: STUDIO_COMMENTS_KEY },
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              items: p.items.filter(
                (c) => c.id !== commentId && c.parentCommentId !== commentId,
              ),
            })),
          },
      );
      return { previous };
    },
    onError: (_e, _id, context) =>
      context?.previous.forEach(([key, data]) => qc.setQueryData(key, data)),
    // Comment totals on the overview just changed.
    onSettled: () =>
      void qc.invalidateQueries({ queryKey: [...STUDIO_KEY, 'overview'] }),
  });
};

export const useUpdateVideo = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      videoId,
      changes,
    }: {
      videoId: string;
      changes: { title?: string; description?: string; categoryId?: string };
    }) => updateVideo(api, videoId, changes),
    onSuccess: (_d, { videoId }) => {
      void qc.invalidateQueries({ queryKey: MY_VIDEOS_KEY });
      void qc.invalidateQueries({ queryKey: queryKeys.video(videoId) });
    },
  });
};

/** Replaces a video's thumbnail with a picked image: signed upload link -> upload -> confirm. */
export const useChangeThumbnail = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ videoId, image }: { videoId: string; image: PickedImage }) => {
      const ticket = await requestThumbnailUpload(api, videoId, `.${image.extension}`);
      await uploadToBlob(ticket.uploadUrl, image.uri, { contentType: image.contentType });
      await confirmThumbnail(api, videoId, ticket.blobName);
    },
    onSuccess: (_d, { videoId }) => {
      void qc.invalidateQueries({ queryKey: MY_VIDEOS_KEY });
      void qc.invalidateQueries({ queryKey: queryKeys.video(videoId) });
      // Home, category and channel lists show the thumbnail too.
      void qc.invalidateQueries({ queryKey: ['feed'] });
      void qc.invalidateQueries({ queryKey: ['library'] });
      void qc.invalidateQueries({ queryKey: ['shorts'] });
      void qc.invalidateQueries({ queryKey: ['trending'] });
      void qc.invalidateQueries({ queryKey: ['related'] });
    },
  });
};

export const useDeleteVideo = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (videoId: string) => deleteVideo(api, videoId),
    // The whole studio tree: content list, overview totals and top videos, analytics, comments.
    onSuccess: (_d, videoId) => {
      void qc.invalidateQueries({ queryKey: STUDIO_KEY });
      void qc.invalidateQueries({ queryKey: queryKeys.video(videoId) });
    },
  });
};
