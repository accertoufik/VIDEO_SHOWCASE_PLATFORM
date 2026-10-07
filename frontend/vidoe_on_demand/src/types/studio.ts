export type DailyViews = { date: string; views: number };

export type StudioTotals = {
  videos: number;
  followers: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
};

export type TopVideo = {
  id: string;
  title: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string | null;
};

export type StudioOverview = {
  periodDays: number;
  totals: StudioTotals;
  period: { views: number; newFollowers: number };
  viewsByDay: DailyViews[];
  topVideos: TopVideo[];
};

export type VideoAnalytics = {
  videoId: string;
  title: string;
  periodDays: number;
  lifetime: { views: number; likes: number; comments: number; shares: number };
  period: { views: number; uniqueViewers: number };
  engagement: {
    watchers: number;
    averageCompletionPercent: number;
    completedCount: number;
  };
  viewsByDay: DailyViews[];
};

export type StudioComment = {
  id: string;
  body: string;
  createdAt: string;
  isReply: boolean;
  parentCommentId: string | null;
  video: { id: string; title: string };
  author: { username: string | null; displayName: string | null };
};

export type StudioCommentsPage = {
  items: StudioComment[];
  nextCursor: string | null;
};
