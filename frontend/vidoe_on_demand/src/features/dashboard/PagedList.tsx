import type {
  InfiniteData,
  UseInfiniteQueryResult,
} from '@tanstack/react-query';
import { useMemo, type ComponentProps, type ReactElement } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useDockInset } from '@/components/navigation/useDockInset';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { colors, layout, spacing } from '@/css';
import type { LibraryPage } from '@/types/library';

type Props<T> = {
  query: UseInfiniteQueryResult<InfiniteData<LibraryPage<T>>, Error>;
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactElement;
  empty: Pick<ComponentProps<typeof EmptyState>, 'icon' | 'title' | 'message'>;
  header?: ReactElement | null;
};

export function PagedList<T>({
  query,
  keyOf,
  renderItem,
  empty,
  header,
}: Props<T>) {
  const dockInset = useDockInset();

  // Pages can overlap if the list changes between fetches; keep the first copy of each key.
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages.flatMap((page) => page.items) ?? []).filter(
      (item) => {
        const key = keyOf(item);
        return seen.has(key) ? false : (seen.add(key), true);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const emptyView = query.isPending ? (
    <View style={styles.skeletons}>
      {[0, 1, 2, 3].map((key) => (
        <View key={key} style={styles.skeletonRow}>
          <Skeleton width={150} height={84} radius='md' />
          <View style={styles.skeletonText}>
            <Skeleton width='90%' height={14} />
            <Skeleton width='60%' height={12} />
          </View>
        </View>
      ))}
    </View>
  ) : query.isError ? (
    <ErrorState error={query.error} onRetry={() => query.refetch()} />
  ) : (
    <EmptyState {...empty} />
  );

  return (
    <FlatList
      data={query.isPending || query.isError ? [] : items}
      keyExtractor={keyOf}
      renderItem={({ item }) => renderItem(item)}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      ListHeaderComponent={header}
      ListEmptyComponent={emptyView}
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <ActivityIndicator
            style={styles.footer}
            color={colors.accent.text}
          />
        ) : null
      }
      contentContainerStyle={[
        styles.content,
        { paddingBottom: dockInset },
      ]}
      onEndReached={() =>
        query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()
      }
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching && !query.isFetchingNextPage}
          onRefresh={() => query.refetch()}
          tintColor={colors.accent.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenPadding, paddingTop: spacing.lg },
  gap: { height: spacing.lg },
  footer: { paddingVertical: spacing.xl },
  skeletons: { gap: spacing.lg },
  skeletonRow: { flexDirection: 'row', gap: spacing.md },
  skeletonText: { flex: 1, gap: spacing.sm, justifyContent: 'center' },
});
