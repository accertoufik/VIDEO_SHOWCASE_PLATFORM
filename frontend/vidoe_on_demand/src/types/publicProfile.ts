export type PublicCreator = {
  id: string;
  channelName: string;
  aboutText: string | null;
  bannerUrl: string | null;
  verified: boolean;
};

export type PublicProfile = {
  displayName: string;
  username: string;
  biography: string | null;
  avatarUrl: string | null;
  /** null = a viewer account with no channel. */
  creator: PublicCreator | null;
  followerCount: number;
  viewer: { isFollowing: boolean; isOwnChannel: boolean } | null;
};
