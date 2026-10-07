export type CreatorResult = {
  id: string;
  channelName: string;
  name: string;
  username: string | null;
  followerCount: number;
  avatarUrl?: string | null;
};

export type SearchScope = 'all' | 'videos' | 'creators' | 'topics';
