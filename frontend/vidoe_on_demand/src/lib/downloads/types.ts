export type DownloadStatus =
  | 'queued'
  | 'downloading'
  | 'completed'
  | 'failed'
  | 'cancelled';

/** What we need to remember about a video so the Downloads tab works with no network. */
export type DownloadMeta = {
  videoId: string;
  title: string;
  creatorName: string;
  durationMs: number | null;
  /** Remote thumbnail (signed, short-lived). Copied to the device when the download finishes. */
  thumbnailUrl: string | null;
};

export type DownloadRecord = DownloadMeta & {
  status: DownloadStatus;
  /** 0..1 */
  progress: number;
  fileUri: string | null;
  thumbnailLocalUri: string | null;
  sizeBytes: number | null;
  error?: string;
  createdAt: number;
};
