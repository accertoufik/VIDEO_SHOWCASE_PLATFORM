import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { isApiError } from '@/api/ApiError';
import {
  completeVideoUpload,
  confirmThumbnail,
  initVideoUpload,
  requestThumbnailUpload,
  type VideoUploadInput,
  type VideoUploadTicket,
} from '@/api/uploads';
import { useApi } from '@/lib/auth/useApi';
import type { PickedImage } from '@/lib/media/pickImage';
import type { PickedVideo } from '@/lib/media/pickVideo';
import { UploadCancelledError, UploadFileMissingError, uploadToBlob } from '@/lib/upload/blobUpload';

export type UploadPhase =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'thumbnail'
  | 'finalizing';

type Input = {
  video: PickedVideo;
  title: string;
  description: string;
  categoryId: string;
  thumbnail: PickedImage | null;
};

export type UploadResult =
  | { ok: true; videoId: string; thumbnailFailed: boolean }
  | { ok: false; error: string; cancelled: boolean };

// The signed URL lasts 15 minutes on the backend. Reuse a ticket on retry only while it is comfortably valid.
const TICKET_MAX_AGE_MS = 10 * 60 * 1000;

type Attempt = {
  signature: string;
  ticket: VideoUploadTicket;
  createdAt: number;
  uploaded: boolean;
  thumbnailDone: boolean;
};

/**
 * init -> PUT the file -> (custom thumbnail) -> complete.
 * A failed attempt remembers how far it got, so "Try again" resumes instead of creating a duplicate video.
 */
export const useVideoUpload = () => {
  const api = useApi();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [progress, setProgress] = useState(0);
  const attempt = useRef<Attempt | null>(null);
  const abort = useRef<AbortController | null>(null);

  const onProgress = (fraction: number) => {
    // Avoid re-rendering hundreds of times a second.
    setProgress((prev) =>
      fraction - prev >= 0.01 || fraction >= 1 ? fraction : prev,
    );
  };

  const running = useRef(false);

  const run = async (input: Input): Promise<UploadResult> => {
    // A second tap (or call) while an upload is starting must not create a second video.
    if (running.current) return { ok: false, error: 'An upload is already in progress.', cancelled: true };
    running.current = true;
    const controller = new AbortController();
    abort.current = controller;
    const signal = controller.signal;

    const signature = JSON.stringify([
      input.video.uri,
      input.title,
      input.description,
      input.categoryId,
      input.thumbnail?.uri ?? null,
    ]);

    try {
      let current = attempt.current;
      const reusable =
        current &&
        current.signature === signature &&
        Date.now() - current.createdAt < TICKET_MAX_AGE_MS;

      if (!reusable || !current) {
        setPhase('preparing');
        setProgress(0);
        const ticket = await initVideoUpload(api, {
          title: input.title,
          description: input.description || undefined,
          categoryId: input.categoryId,
          fileExtension: input.video.extension,
          thumbnailSource: input.thumbnail ? 'CUSTOM' : 'AUTO',
        });
        current = {
          signature,
          ticket,
          createdAt: Date.now(),
          uploaded: false,
          thumbnailDone: false,
        };
        attempt.current = current;
      }

      if (!current.uploaded) {
        setPhase('uploading');
        setProgress(0);
        await uploadToBlob(current.ticket.uploadUrl, input.video.uri, {
          contentType: input.video.contentType,
          onProgress,
          signal,
        });
        current.uploaded = true;
      }

      let thumbnailFailed = false;
      if (input.thumbnail && !current.thumbnailDone) {
        setPhase('thumbnail');
        try {
          const t = await requestThumbnailUpload(
            api,
            current.ticket.videoId,
            input.thumbnail.extension,
          );
          await uploadToBlob(t.uploadUrl, input.thumbnail.uri, {
            contentType: input.thumbnail.contentType,
            signal,
          });
          await confirmThumbnail(api, current.ticket.videoId, t.blobName);
          current.thumbnailDone = true;
        } catch (error) {
          if (error instanceof UploadCancelledError) throw error;
          // The video matters more than its cover: carry on, the worker generates one automatically.
          thumbnailFailed = true;
        }
      }

      setPhase('finalizing');
      await completeVideoUpload(api, current.ticket.videoId);

      const videoId = current.ticket.videoId;
      attempt.current = null;
      await qc.invalidateQueries({ queryKey: ['studio'] });
      return { ok: true, videoId, thumbnailFailed };
    } catch (error) {
      if (error instanceof UploadCancelledError) {
        attempt.current = null;
        return { ok: false, error: 'Upload cancelled.', cancelled: true };
      }
      return {
        ok: false,
        error: isApiError(error)
          ? error.message
          : error instanceof UploadFileMissingError
            ? error.message
            : "The upload didn't finish. Check your connection and try again.",
        cancelled: false,
      };
    } finally {
      running.current = false;
      abort.current = null;
      setPhase('idle');
    }
  };

  const cancel = () => abort.current?.abort();

  return { run, cancel, phase, progress, busy: phase !== 'idle' };
};
