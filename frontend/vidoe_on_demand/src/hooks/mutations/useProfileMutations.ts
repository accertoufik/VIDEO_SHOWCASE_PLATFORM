import { haptics } from '@/lib/haptics';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { isApiError } from '@/api/ApiError';
import {
  clearWatchHistory,
  followCreator,
  unfollowCreator,
  updateProfile,
  uploadAvatar,
} from '@/api/profile';
import { LIBRARY_KEY } from '@/hooks/queries/useLibrary';
import { PROFILE_KEY } from '@/hooks/queries/useProfile';
import { useApi } from '@/lib/auth/useApi';
import { describeError } from '@/lib/errors/describeError';
import type { PickedImage } from '@/lib/media/pickImage';
import { queryKeys } from '@/lib/query/queryKeys';
import type { PublicProfile } from '@/types/publicProfile';

/** Optimistic follow/unfollow on the channel page: the button and the count flip at once; a failure puts them back. */
export const useFollowCreator = (username: string) => {
  const api = useApi();
  const qc = useQueryClient();
  const key = [...PROFILE_KEY, username];

  return useMutation({
    mutationFn: ({
      creatorId,
      follow,
    }: {
      creatorId: string;
      follow: boolean;
    }) =>
      follow ? followCreator(api, creatorId) : unfollowCreator(api, creatorId),
    onMutate: async ({ follow }) => {
      haptics.tap();
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<PublicProfile>(key);
      if (previous) {
        qc.setQueryData<PublicProfile>(key, {
          ...previous,
          followerCount: Math.max(
            0,
            previous.followerCount + (follow ? 1 : -1),
          ),
          viewer: previous.viewer && {
            ...previous.viewer,
            isFollowing: follow,
          },
        });
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: LIBRARY_KEY }); // the Following list
    },
  });
};

export type ProfileEditResult =
  | { ok: true; avatarFailed: boolean }
  | { ok: false; error: string };

/** Save name/bio, then the optional new photo. The text is the part that must succeed. */
export const useProfileEdit = () => {
  const api = useApi();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const run = async ({
    changes,
    avatar,
  }: {
    changes: { displayName?: string; username?: string; biography?: string };
    avatar: PickedImage | null;
  }): Promise<ProfileEditResult> => {
    setBusy(true);
    try {
      if (Object.keys(changes).length > 0) await updateProfile(api, changes);

      let avatarFailed = false;
      if (avatar) {
        try {
          // Streams the file from disk and confirms it; the avatar route needs the extension WITH a dot,
          // which uploadAvatar takes care of.
          await uploadAvatar(api, {
            uri: avatar.uri,
            mimeType: avatar.contentType,
          });
        } catch {
          avatarFailed = true;
        }
      }

      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.me }),
        qc.invalidateQueries({ queryKey: PROFILE_KEY }),
      ]);
      return { ok: true, avatarFailed };
    } catch (error) {
      return {
        ok: false,
        error: isApiError(error) ? error.message : describeError(error).message,
      };
    } finally {
      setBusy(false);
    }
  };

  return { run, busy };
};

export const useClearHistory = () => {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => clearWatchHistory(api),
    onSuccess: () => void qc.invalidateQueries({ queryKey: LIBRARY_KEY }),
  });
};
