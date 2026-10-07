import type { CategorySummary, VideoCardData, VideoType } from '@/types/video';
import { toNumber } from '@/utils/normalize';

type Raw = Record<string, unknown>;
const str = (v: unknown): string | null =>
  typeof v === 'string' && v ? v : null;

export const toCategory = (raw: Raw): CategorySummary => ({
  id: String(raw.id ?? ''),
  name: str(raw.name) ?? 'Category',
  slug: str(raw.slug) ?? '',
});

/** Raw API video row -> VideoCardData. BigInt counters may arrive as strings, so they're normalised here. */
export const toVideoCard = (raw: Raw): VideoCardData => {
  const info = (raw.creatorInfo ?? {}) as Raw;
  const category = raw.category as Raw | null | undefined;
  const channelName = str(info.channelName) ?? 'Creator';

  return {
    id: String(raw.id ?? ''),
    title: str(raw.title) ?? 'Untitled',
    type: (raw.type === 'SHORT_FORM' ? 'SHORT_FORM' : 'LONG_FORM') as VideoType,
    durationMs: raw.durationMs == null ? null : toNumber(raw.durationMs, 0),
    viewCount: toNumber(raw.viewCount, 0),
    publishedAt: str(raw.publishedAt),
    thumbnailUrl: str(raw.thumbnailUrl),
    width: raw.width == null ? null : toNumber(raw.width, 0),
    height: raw.height == null ? null : toNumber(raw.height, 0),
    creator: {
      id: str(info.id) ?? str(raw.creatorId) ?? '',
      channelName,
      name: str(info.displayName) ?? channelName,
      username: str(info.username),
      avatarUrl: str(info.avatarUrl),
    },
    category: category ? toCategory(category) : null,
  };
};

import type {
  PlaybackProgress,
  VideoDetail,
  VideoVariantInfo,
  ViewerState,
} from '@/types/video';

export const toVideoDetail = (raw: Raw): VideoDetail => {
  const base = toVideoCard(raw);
  const info = (raw.creatorInfo ?? {}) as Raw;
  const variants = Array.isArray(raw.variants) ? (raw.variants as Raw[]) : [];

  return {
    ...base,
    description: str(raw.description),
    visibility: (raw.visibility === 'PRIVATE' || raw.visibility === 'UNLISTED'
      ? raw.visibility
      : 'PUBLIC') as VideoDetail['visibility'],
    status: str(raw.status) ?? '',
    hdReady: Boolean(raw.hdReady),
    hasStream: Boolean(raw.hasStream),
    canDownload: Boolean(raw.canDownload),
    likeCount: toNumber(raw.likeCount, 0),
    commentCount: toNumber(raw.commentCount, 0),
    shareCount: toNumber(raw.shareCount, 0),
    creator: {
      ...base.creator,
      followerCount: toNumber(info.followerCount, 0),
    },
    variants: variants
      .map<VideoVariantInfo>((v) => ({
        label: String(v.label ?? ''),
        width: toNumber(v.width, 0),
        height: toNumber(v.height, 0),
        ready: v.status === 'READY',
      }))
      .filter((v) => v.label)
      .sort((a, b) => b.height - a.height),
  };
};

export const toViewer = (raw: unknown): ViewerState | null => {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Raw;
  const p = v.progress as Raw | null | undefined;
  const progress: PlaybackProgress | null = p
    ? {
        positionMs: toNumber(p.positionMs, 0),
        completionPercent: toNumber(p.completionPercent, 0),
        completed: Boolean(p.completed),
      }
    : null;
  return {
    isLiked: Boolean(v.isLiked),
    isSaved: Boolean(v.isSaved),
    isWatchLater: Boolean(v.isWatchLater),
    isFollowingCreator: Boolean(v.isFollowingCreator),
    isOwner: Boolean(v.isOwner),
    progress,
  };
};

import type { Comment } from '@/types/social';

export const toComment = (raw: Raw): Comment => {
  const author = (raw.author ?? {}) as Raw;
  const replies = Array.isArray(raw.replies) ? (raw.replies as Raw[]) : [];
  return {
    id: String(raw.id ?? ''),
    parentCommentId: str(raw.parentCommentId),
    body: str(raw.body) ?? '',
    createdAt: str(raw.createdAt) ?? '',
    isMine: Boolean(raw.isMine),
    author: {
      username: str(author.username),
      displayName: str(author.displayName) ?? 'User',
      avatarUrl: str(author.avatarUrl),
    },
    replies: replies.map(toComment),
  };
};