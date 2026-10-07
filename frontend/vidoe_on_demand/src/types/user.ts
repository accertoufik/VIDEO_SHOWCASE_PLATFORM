export type Profile = {
  username: string;
  displayName: string;
  biography?: string | null;
  /** Signed URL if the API provides one; otherwise Avatar falls back to initials. */
  avatarUrl?: string | null;
};

export type CreatorProfile = {
  id: string;
  channelName: string;
  aboutText?: string | null;
  verificationStatus?: string;
  /** Signed URL for the channel banner, if one is set. */
  bannerUrl?: string | null;
};

export type UserSettings = {
  pushNotifications?: boolean;
  emailNotifications?: boolean;
  privateAccount?: boolean;
  preferredLanguage?: string;
};

export type Me = {
  id: string;
  role?: string;
  profile: Profile | null;
  creatorProfile: CreatorProfile | null;
  settings: UserSettings | null;
  /** How many creators this account follows. */
  followingCount?: number;
  /** True until the user has chosen their own display name + handle (placeholder profile from sign-up). */
  needsOnboarding?: boolean;
};
