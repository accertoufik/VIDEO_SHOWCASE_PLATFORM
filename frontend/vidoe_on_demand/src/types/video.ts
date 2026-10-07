export type VideoType = 'LONG_FORM' | 'SHORT_FORM';

export type CreatorSummary = {
  id: string;
  channelName: string;
  /** Display name, falling back to the channel name. */
  name: string;
  username: string | null;
  // Profile
  biography?: string | null;
  avatarUrl?: string | null; // signed URL, added to /api/me in Phase 11
  // Me
  settings?: { pushNotifications?: boolean } | null;
};

export type CategorySummary = { id: string; name: string; slug: string };

/** The one shape every video card/list in the app uses. Built by toVideoCard(). */
export type VideoCardData = {
  id: string;
  title: string;
  type: VideoType;
  durationMs: number | null;
  viewCount: number;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  creator: CreatorSummary;
  category: CategorySummary | null;
};

export type VideoPage = { videos: VideoCardData[]; nextCursor: string | null };

export type VideoVariantInfo = {
  label: string;
  width: number;
  height: number;
  ready: boolean;
};

export type PlaybackProgress = {
  positionMs: number;
  completionPercent: number;
  completed: boolean;
};

/** The signed-in viewer's relationship to a video. null for anonymous viewers. */
export type ViewerState = {
  isLiked: boolean;
  isSaved: boolean;
  isWatchLater: boolean;
  isFollowingCreator: boolean;
  isOwner: boolean;
  progress: PlaybackProgress | null;
};

export type VideoDetail = Omit<VideoCardData, 'creator'> & {
  description: string | null;
  visibility: 'PUBLIC' | 'UNLISTED' | 'PRIVATE';
  status: string;
  hdReady: boolean;
  /** HLS manifest exists, so the video can be streamed. */
  hasStream: boolean;
  /** The original file is available through GET /download. */
  canDownload: boolean;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  creator: VideoCardData['creator'] & { followerCount: number };
  /** Renditions the backend has actually produced. Drives the quality menu. */
  variants: VideoVariantInfo[];
};