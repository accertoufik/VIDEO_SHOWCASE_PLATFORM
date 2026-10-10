import * as FS from '@/lib/downloads/fs';

export class UploadCancelledError extends Error {
  constructor() {
    super('Upload cancelled');
    this.name = 'UploadCancelledError';
  }
}

export class UploadFileMissingError extends Error {
  constructor() {
    super('That video is no longer available on your phone. Please choose it again.');
    this.name = 'UploadFileMissingError';
  }
}

type Options = {
  contentType: string;
  /** 0..1 */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

/**
 * Direct-to-Azure upload: the file never passes through our API.
 * Azure requires x-ms-blob-type on a single-shot PUT and answers 201 Created.
 */
export const uploadToBlob = async (
  uploadUrl: string,
  fileUri: string,
  { contentType, onProgress, signal }: Options,
) => {
  if (signal?.aborted) throw new UploadCancelledError();
  const info = await FS.getInfoAsync(fileUri).catch(() => null);
  if (!info?.exists) throw new UploadFileMissingError();

  const task = FS.createUploadTask(
    uploadUrl,
    fileUri,
    {
      httpMethod: 'PUT',
      uploadType: FS.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'x-ms-blob-type': 'BlockBlob', 'Content-Type': contentType },
    },
    (progress) => {
      if (progress.totalBytesExpectedToSend > 0)
        onProgress?.(
          progress.totalBytesSent / progress.totalBytesExpectedToSend,
        );
    },
  );

  const onAbort = () => {
    void task.cancelAsync();
  };
  signal?.addEventListener('abort', onAbort);

  try {
    const result = await task.uploadAsync();
    if (signal?.aborted) throw new UploadCancelledError();
    if (!result || result.status < 200 || result.status >= 300) {
      throw new Error(`Upload failed${result ? ` (${result.status})` : ''}.`);
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
};
