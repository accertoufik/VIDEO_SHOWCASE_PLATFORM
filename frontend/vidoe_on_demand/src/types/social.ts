export type CommentAuthor = {
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
};

export type Comment = {
  id: string;
  /** Set on replies. Replies are one level deep: the server stores a reply-to-a-reply under the top-level comment. */
  parentCommentId: string | null;
  body: string;
  createdAt: string;
  isMine: boolean;
  author: CommentAuthor;
  replies: Comment[];
};
