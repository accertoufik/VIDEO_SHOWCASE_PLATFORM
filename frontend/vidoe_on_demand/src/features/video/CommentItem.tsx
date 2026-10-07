import { memo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { AppText } from "@/components/ui/Text";
import { spacing } from "@/css";
import type { Comment } from "@/types/social";
import { formatRelativeTime } from "@/utils/format";

type Props = {
  comment: Comment;
  isReply?: boolean;
  onReply: (comment: Comment) => void;
  onDelete: (comment: Comment) => void;
};

export const CommentItem = memo(({ comment, isReply = false, onReply, onDelete }: Props) => {
  const [showReplies, setShowReplies] = useState(false);

  // One tap deletes your own comment (it disappears at once, and rolls back if the server refuses).
  const confirmDelete = () => onDelete(comment);

  return (
    <View style={styles.root}>
      <Avatar uri={comment.author.avatarUrl} name={comment.author.displayName} size="sm" />
      <View style={styles.body}>
        <View style={styles.head}>
          <AppText variant="label" numberOfLines={1} style={styles.author}>
            {comment.author.displayName}
          </AppText>
          <AppText variant="caption" color="muted">
            {formatRelativeTime(comment.createdAt)}
          </AppText>
        </View>
        <AppText variant="body">{comment.body}</AppText>

        <View style={styles.actions}>
          <Pressable onPress={() => onReply(comment)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Reply to ${comment.author.displayName}`}>
            <AppText variant="label" color="secondary">
              Reply
            </AppText>
          </Pressable>
          {comment.isMine ? (
            <Pressable onPress={confirmDelete} hitSlop={8} accessibilityRole="button" accessibilityLabel="Delete your comment">
              <AppText variant="label" color="error">
                Delete
              </AppText>
            </Pressable>
          ) : null}
        </View>

        {!isReply && comment.replies.length ? (
          <>
            <Pressable onPress={() => setShowReplies((v) => !v)} hitSlop={8} accessibilityRole="button">
              <AppText variant="label" color="accent">
                {showReplies ? "Hide replies" : `View ${comment.replies.length} ${comment.replies.length === 1 ? "reply" : "replies"}`}
              </AppText>
            </Pressable>
            {showReplies ? (
              <View style={styles.replies}>
                {comment.replies.map((reply) => (
                  <CommentItem key={reply.id} comment={reply} isReply onReply={onReply} onDelete={onDelete} />
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
});
CommentItem.displayName = "CommentItem";

const styles = StyleSheet.create({
  root: { flexDirection: "row", gap: spacing.md },
  body: { flex: 1, gap: spacing.xs },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  author: { flexShrink: 1 },
  actions: { flexDirection: "row", gap: spacing.xl, paddingTop: spacing.xs },
  replies: { gap: spacing.lg, paddingTop: spacing.md },
});