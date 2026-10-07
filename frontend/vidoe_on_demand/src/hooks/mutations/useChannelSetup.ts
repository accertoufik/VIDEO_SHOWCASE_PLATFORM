import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { isApiError } from '@/api/ApiError';
import {
  becomeCreator,
  confirmBanner,
  requestBannerUpload,
  updateAbout,
} from '@/api/creator';
import { useApi } from '@/lib/auth/useApi';
import { describeError } from '@/lib/errors/describeError';
import type { PickedImage } from '@/lib/media/pickImage';
import { queryKeys } from '@/lib/query/queryKeys';
import { uploadToBlob } from '@/lib/upload/blobUpload';

export type SetupStep = 'idle' | 'channel' | 'banner';

type Input = {
  /** null = leave the existing text alone (edit mode, unchanged). */
  aboutText: string | null;
  banner: PickedImage | null;
  /** True when the user already has a channel: we edit instead of create. */
  existing: boolean;
};

export type SetupResult =
  | { ok: true; warnings: string[] }
  | { ok: false; error: string };

/**
 * Create the channel (named after the username, about text from the bio) or edit it, then upload the optional banner. The channel is the part that must succeed.
 * If a photo upload fails afterwards the channel still exists, so we report a warning instead of an error.
 */
export const useChannelSetup = () => {
  const api = useApi();
  const qc = useQueryClient();
  const [step, setStep] = useState<SetupStep>('idle');

  const uploadBanner = async (image: PickedImage) => {
    const ticket = await requestBannerUpload(api, image.extension);
    await uploadToBlob(ticket.uploadUrl, image.uri, {
      contentType: image.contentType,
    });
    await confirmBanner(api, ticket.blobName);
  };

  const run = async (input: Input): Promise<SetupResult> => {
    const warnings: string[] = [];
    try {
      setStep('channel');
      if (input.existing) {
        if (input.aboutText !== null) await updateAbout(api, input.aboutText);
      } else {
        try {
          // No channel name: the server names the channel after the account's username.
          await becomeCreator(api, { aboutText: input.aboutText || undefined });
        } catch (error) {
          // Someone double-tapped, or finished this on another device: the channel exists, so carry on.
          const alreadyCreator =
            isApiError(error) &&
            error.status === 409 &&
            /already a creator/i.test(error.message);
          if (!alreadyCreator) throw error;
        }
      }

      if (input.banner) {
        setStep('banner');
        try {
          await uploadBanner(input.banner);
        } catch {
          warnings.push('banner');
        }
      }

      // Refetch /api/me so the creator guard, Profile and the Home avatar all pick up the new state.
      await qc.invalidateQueries({ queryKey: queryKeys.me });
      return { ok: true, warnings };
    } catch (error) {
      return {
        ok: false,
        error: isApiError(error) ? error.message : describeError(error).message,
      };
    } finally {
      setStep('idle');
    }
  };

  return { run, step, busy: step !== 'idle' };
};
