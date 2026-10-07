import { useDockInset } from '@/components/navigation/useDockInset';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { EmptyNotice } from '@/components/ui/EmptyNotice';
import { ListSkeleton, ScreenSkeleton } from '@/components/ui/skeletons';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlassButton } from '@/components/ui/GlassButton';
import { colors, layout, spacing } from '@/css';
import { StudioCommentRow } from '@/features/studio/StudioCommentRow';
import { useRemoveStudioComment } from '@/hooks/mutations/useStudioMutations';
import { useStudioComments } from '@/hooks/queries/useStudio';
import { describeError } from '@/lib/errors/describeError';
import { toast } from '@/lib/toast';
import type { StudioComment } from '@/types/studio';

export const CommentsPage = ({ videoId }: { videoId?: string }) => {
  const router = useRouter();
  const dockInset = useDockInset(); // keeps the last items clear of the floating dock
  const query = useStudioComments(videoId);
  const remove = useRemoveStudioComment();

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  if (query.isPending)
    return (
      <ScreenSkeleton>
        <ListSkeleton variant='text' rows={5} />
      </ScreenSkeleton>
    );

  if (query.isError) {
    return (
      <View style={styles.root}>
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </View>
    );
  }

  const confirmDelete = (comment: StudioComment) =>
    Alert.alert(
      'Delete this comment?',
      comment.isReply
        ? 'It will be removed for everyone.'
        : 'It will be removed for everyone, along with any replies to it.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            remove.mutate(comment.id, {
              onError: (e) => toast.error(describeError(e).message),
            }),
        },
      ],
    );

  return (
    <View style={styles.root}>
      <FlatList
        data={items}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <StudioCommentRow
            comment={item}
            onOpenVideo={(id) => router.push(`/video/${id}`)}
            onDelete={confirmDelete}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {videoId ? (
              <GlassButton
                label='Showing one video. Show all comments'
                variant='glass'
                size='sm'
                onPress={() => router.setParams({ videoId: undefined })}
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyNotice
            icon='chatbubble-outline'
            title='No comments yet'
            message="Comments on your videos will show up here, where you can remove any you don't want."
          />
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <ActivityIndicator
              color={colors.text.primary}
              style={styles.footer}
            />
          ) : null
        }
        onEndReached={() =>
          query.hasNextPage &&
          !query.isFetchingNextPage &&
          query.fetchNextPage()
        }
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => query.refetch()}
            tintColor={colors.text.primary}
          />
        }
        contentContainerStyle={[
          styles.content,
          { paddingBottom: dockInset },
        ]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};


const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: spacing.sm },
  header: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
    alignItems: 'flex-start',
  },
  separator: { height: spacing.md },
  footer: { paddingVertical: spacing.lg },
});
