export type VideoStatus =
  | 'DRAFT'
  | 'UPLOADING'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'FAILED'
  | 'DELETED';
export type Visibility = 'PUBLIC' | 'UNLISTED' | 'PRIVATE';

/** One of the signed-in creator's own videos, as shown in My videos. */
export type MyVideo = {
  id: string;
  title: string;
  description: string | null;
  categoryId: string | null;
  status: VideoStatus;
  /** What is actually live. Stays PRIVATE until publish. */
  visibility: Visibility;
  /** What the creator picked at upload time: pre-fills the publish sheet. */
  requestedVisibility: Visibility | null;
  durationSec: number | null;
  hdReady: boolean;
  createdAt: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
};
