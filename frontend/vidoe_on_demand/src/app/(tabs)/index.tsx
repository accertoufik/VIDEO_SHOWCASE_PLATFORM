import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import { SectionHeader } from '@/features/home/SectionHeader';
import { VideoCard, VideoCardSkeleton } from '@/components/video';
import { colors, layout, spacing } from '@/css';
import { CategoryRow } from '@/features/home/CategoryRow';
import { HomeHeader } from '@/features/home/HomeHeader';
import { TrendingSection } from '@/features/home/TrendingSection';
import { useCategories } from '@/hooks/queries/useCategories';
import { useFeed } from '@/hooks/queries/useFeed';
import { useMe } from '@/hooks/queries/useMe';
import { useTrending } from '@/hooks/queries/useTrending';
import { signInHref } from '@/lib/auth/redirect';
import { homeTap } from '@/lib/navigation/homeTap';
import { queryKeys } from '@/lib/query/queryKeys';
import type { VideoCardData } from '@/types/video';
import { uniqueById } from '@/utils/collection';

const HomeScreen = () => {
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const me = useMe();
  const dockInset = useDockInset();
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
  const listRef = useRef<FlatList<VideoCardData>>(null);

  // Tapping Home in the dock: back to the "All" tab, scrolled to the top.
  useEffect(
    () =>
      homeTap.subscribe(() => {
        setCategoryId(undefined);
        listRef.current?.scrollToOffset({ offset: 0, animated: true });
      }),
    [],
  );

  const categories = useCategories();
  const trending = useTrending('LONG_FORM', categoryId);
  const feed = useFeed(categoryId);

  const videos = useMemo(
    () => uniqueById(feed.data?.pages.flatMap((page) => page.videos) ?? []),
    [feed.data],
  );
  const refreshing = feed.isRefetching && !feed.isFetchingNextPage;

  // Pull-to-refresh used to refetch EVERY page already scrolled through, plus trending and categories,
  // on each pull. Repeated pulls multiplied that and hit the API rate limit. Now: at most one refresh every
  // 8 seconds, and it only reloads the first page of the feed.
  const queryClient = useQueryClient();
  const lastRefresh = useRef(0);
  const refresh = () => {
    const now = Date.now();
    if (now - lastRefresh.current < 8_000) return;
    lastRefresh.current = now;
    queryClient.setQueryData<typeof feed.data>(queryKeys.feed(categoryId), (old) =>
      old
        ? { pages: old.pages.slice(0, 1), pageParams: old.pageParams.slice(0, 1) }
        : old,
    );
    feed.refetch();
    trending.refetch();
  };

  const loadMore = () => {
    if (feed.hasNextPage && !feed.isFetchingNextPage) feed.fetchNextPage();
  };

  const header = (
    <View>
      <HomeHeader
        signedIn={Boolean(isSignedIn)}
        avatarUri={me.data?.profile?.avatarUrl}
        name={me.data?.profile?.displayName}
        onSearch={() => router.push('/search')}
        onProfile={() => router.push(isSignedIn ? '/profile' : signInHref('/'))}
      />
      <CategoryRow
        categories={categories.data}
        loading={categories.isPending}
        selectedId={categoryId}
        onSelect={setCategoryId}
      />
      <TrendingSection videos={trending.data} loading={trending.isPending} />
      <View style={styles.feedTitle}>
        <SectionHeader title={categoryId ? 'In this category' : 'Latest'} />
      </View>
    </View>
  );

  const empty = feed.isPending ? (
    <View style={styles.skeletons}>
      {[0, 1, 2].map((key) => (
        <VideoCardSkeleton key={key} />
      ))}
    </View>
  ) : feed.isError ? (
    <ErrorState error={feed.error} onRetry={() => feed.refetch()} />
  ) : (
    <EmptyState
      icon='film-outline'
      title={categoryId ? 'Nothing here yet' : 'No videos yet'}
      message={
        categoryId
          ? 'No public videos in this category. Try another.'
          : 'Public videos will appear here.'
      }
    />
  );

  return (
    <FlatList<VideoCardData>
      ref={listRef}
      style={styles.list}
      data={feed.isPending || feed.isError ? [] : videos}
      keyExtractor={(video) => video.id}
      renderItem={({ item }) => (
        <View style={styles.item}>
          <VideoCard video={item} />
        </View>
      )}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={
        feed.isFetchingNextPage ? (
          <ActivityIndicator
            style={styles.footer}
            color={colors.accent.text}
          />
        ) : null
      }
      contentContainerStyle={{ paddingBottom: dockInset }}
      onEndReached={loadMore}
      onEndReachedThreshold={0.6}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={refresh}
          tintColor={colors.accent.primary}
        />
      }
      showsVerticalScrollIndicator={false}
      initialNumToRender={4}
      windowSize={7}
      removeClippedSubviews
    />
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background.primary },
  item: {
    paddingHorizontal: layout.screenPadding,
    marginBottom: spacing.section,
  },
  feedTitle: { paddingTop: spacing.section },
  skeletons: { paddingHorizontal: layout.screenPadding, gap: spacing.section },
  footer: { paddingVertical: spacing.xl },
});
