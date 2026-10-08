import { ErrorState } from '@/components/ui/ErrorState';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassIconButton } from '@/components/ui/GlassIconButton';
import { AppText } from '@/components/ui/Text';
import { colors, layout, radii, spacing, typography } from '@/css';
import {
  TEMP_COMMENT_PREFIX,
  useAddComment,
  useDeleteComment,
} from '@/hooks/mutations/useCommentMutation';
import { useComments } from '@/hooks/queries/useComments';
import { signInHref } from '@/lib/auth/redirect';
import type { Comment } from '@/types/social';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommentItem } from './CommentItem';

type Props = {
  videoId: string;
  visible: boolean;
  count: number;
  onClose: () => void;
  /** The watch page: the sheet must stop at the bottom edge of the player above it (tablets). */
  belowPlayer?: boolean;
};

const MAX_LENGTH = 2000; // matches the backend limit

export const CommentsSheet = ({ videoId, visible, count, onClose, belowPlayer = false }: Props) => {
  const insets = useSafeAreaInsets();
  // On a tablet (shorter side 600dp+) the sheet spans the full width. On the watch page it also reaches down from the
  // bottom of the 16:9 player, so the video stays visible above it; elsewhere (Shorts) it keeps the usual 60% height.
  const { width, height } = useWindowDimensions();
  const wide = Math.min(width, height) >= 600;
  const playerBottom = insets.top + (width * 9) / 16;
  const wideStyle = wide
    ? { maxWidth: undefined, width: '100%' as const, ...(belowPlayer ? { height: Math.max(240, height - playerBottom) } : null) }
    : null;
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  const comments = useComments(videoId, visible);
  const add = useAddComment(videoId);
  const remove = useDeleteComment(videoId);

  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  // Android draws edge-to-edge inside this Modal, so the window doesn't resize for the keyboard:
  // lift the sheet by the keyboard's height ourselves so the input stays visible while typing.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // A synchronous guard: state (isPending, text) only updates on the next render, so a touch-down followed by the
  // press event a moment later could otherwise both get through and post the comment twice.
  const submitting = useRef(false);

  const submit = () => {
    const body = text.trim();
    if (!body || submitting.current) return;
    submitting.current = true;
    const reply = replyTo;
    // Clear the box and show the comment at once; if the server refuses, the text comes back.
    setText('');
    setReplyTo(null);
    add.mutate(
      { body, parentCommentId: reply?.id },
      {
        onError: () => {
          setText(body);
          setReplyTo(reply);
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  };

  // The sign-in screen is a route, so close this sheet first or it would cover it.
  const signIn = () => {
    onClose();
    router.push(signInHref(pathname));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType='slide'
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <Pressable
          style={styles.dismiss}
          onPress={onClose}
          accessibilityLabel='Close comments'
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.sheet, wideStyle, keyboardHeight ? { marginBottom: keyboardHeight } : null]}
        >
          <View style={styles.header}>
            <AppText variant='h3' accessibilityRole='header'>
              Comments{count > 0 ? ` · ${count}` : ''}
            </AppText>
            <GlassIconButton
              icon='close'
              label='Close comments'
              onPress={onClose}
            />
          </View>

          <FlatList
            data={comments.data ?? []}
            keyExtractor={(comment) => comment.id}
            renderItem={({ item }) => (
              <CommentItem
                comment={item}
                onReply={(comment) =>
                  !comment.id.startsWith(TEMP_COMMENT_PREFIX) && setReplyTo(comment)
                }
                onDelete={(comment) =>
                  // A comment still being posted has no server id yet.
                  !comment.id.startsWith(TEMP_COMMENT_PREFIX) &&
                  remove.mutate(comment.id)
                }
              />
            )}
            ItemSeparatorComponent={() => <View style={styles.gap} />}
            ListEmptyComponent={
              comments.isPending ? (
                <ActivityIndicator
                  style={styles.loader}
                  color={colors.accent.text}
                />
              ) : comments.isError ? (
                <ErrorState
                  error={comments.error}
                  onRetry={() => comments.refetch()}
                />
              ) : (
                <View style={styles.empty}>
                  <Ionicons name='chatbubbles-outline' size={34} color={colors.text.primary} />
                  <AppText variant='title'>No comments yet</AppText>
                  <AppText variant='bodySmall' color='secondary'>
                    Start the conversation.
                  </AppText>
                </View>
              )
            }
            contentContainerStyle={styles.list}
            // 'always': a tap on Reply / Delete / a comment while the keyboard is open must act on the FIRST tap.
            // With 'handled' + dismiss-on-drag, a finger that moved a pixel was read as a scroll, which closed the
            // keyboard and cancelled the tap, so every button needed a second press.
            keyboardShouldPersistTaps='always'
            keyboardDismissMode='none'
          />

          <View
            style={[
              styles.composer,
              { paddingBottom: insets.bottom + spacing.md },
            ]}
          >
            {isSignedIn ? (
              <>
                {replyTo ? (
                  <View style={styles.replying}>
                    <AppText
                      variant='bodySmall'
                      color='secondary'
                      numberOfLines={1}
                      style={styles.replyingText}
                    >
                      Replying to {replyTo.author.displayName}
                    </AppText>
                    <Pressable
                      onPress={() => setReplyTo(null)}
                      hitSlop={10}
                      accessibilityRole='button'
                      accessibilityLabel='Cancel reply'
                    >
                      <Ionicons
                        name='close-circle'
                        size={18}
                        color={colors.text.muted}
                      />
                    </Pressable>
                  </View>
                ) : null}
                <View style={styles.inputRow}>
                  <TextInput
                    value={text}
                    onChangeText={setText}
                    placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
                    placeholderTextColor={colors.text.muted}
                    selectionColor={colors.accent.primary}
                    maxLength={MAX_LENGTH}
                    multiline
                    accessibilityLabel='Comment'
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    // The keyboard's own send key posts too, so posting never depends on hitting the small button.
                    returnKeyType='send'
                    submitBehavior='submit'
                    onSubmitEditing={submit}
                    style={[typography.body, styles.input, inputFocused && styles.inputFocused]}
                  />
                  <GlassIconButton
                    icon='send'
                    label='Post comment'
                    // Send on touch-DOWN: the first touch also hides the keyboard, which moves this button down
                    // before the finger lifts, so a normal tap (touch-up) used to land on empty space. submit()
                    // ignores the second call (screen readers use onPress) while a post is in flight.
                    onPressIn={submit}
                    onPress={submit}
                    disabled={!text.trim()}
                  />
                </View>
              </>
            ) : (
              <GlassButton
                label='Sign in to comment'
                variant='primary'
                fullWidth
                onPress={signIn}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    // Light dimming only: the video above the sheet keeps playing and stays watchable while you comment.
    backgroundColor: colors.overlay.scrimLight,
  },
  dismiss: { flex: 1 },
  sheet: {
    height: '60%',
    backgroundColor: colors.background.elevated,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
  },
  list: {
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    flexGrow: 1,
  },
  gap: { height: spacing.xl },
  loader: { paddingVertical: spacing.xxxl },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xxxl },
  composer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.surface.border,
  },
  replying: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  replyingText: { flex: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: layout.minTouchTarget,
    color: colors.text.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.glassMedium,
    // Always 2px wide (transparent) so gaining focus never moves anything; focus makes it white.
    borderWidth: layout.focusRingWidth,
    borderColor: 'transparent',
  },
  inputFocused: { borderColor: colors.focus },
});
