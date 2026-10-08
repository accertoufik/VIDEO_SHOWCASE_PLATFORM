import { useDockInset } from '@/components/navigation/useDockInset';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { EmptyHero } from '@/components/ui/EmptyHero';
import { ErrorState } from '@/components/ui/ErrorState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { VideoCard, VideoCardSkeleton } from '@/components/video';
import { colors, layout, spacing } from '@/css';
import { useCategories } from '@/hooks/queries/useCategories';
import { useFeed } from '@/hooks/queries/useFeed';
import type { VideoCardData } from '@/types/video';
import { uniqueById } from '@/utils/collection';

const CategoryScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const dockInset = useDockInset(); // keeps the last items clear of the floating dock
  const categories = useCategories();
  const feed = useFeed(id);

  // Name comes from the cached category list (same data Home already loaded).
  const title =
    categories.data?.find((category) => category.id === id)?.name ?? 'Category';
  const videos = useMemo(
    () => uniqueById(feed.data?.pages.flatMap((page) => page.videos) ?? []),
    [feed.data],
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
    <EmptyHero
      icon='albums-outline'
      title='No videos in this category yet'
      message='Creators haven’t posted here yet. Check back soon or explore another category.'
      action={{ label: 'Browse all videos', icon: 'compass-outline', onPress: () => router.replace('/') }}
    />
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title={title} />
      <FlatList<VideoCardData>
        data={feed.isPending || feed.isError ? [] : videos}
        keyExtractor={(video) => video.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <VideoCard video={item} />
          </View>
        )}
        ListEmptyComponent={empty}
        ListFooterComponent={
          feed.isFetchingNextPage ? (
            <ActivityIndicator
              style={styles.footer}
              color={colors.accent.text}
            />
          ) : null
        }
        contentContainerStyle={{
          paddingTop: spacing.sm,
          paddingBottom: dockInset,
        }}
        onEndReached={() =>
          feed.hasNextPage && !feed.isFetchingNextPage && feed.fetchNextPage()
        }
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl
            refreshing={feed.isRefetching && !feed.isFetchingNextPage}
            onRefresh={() => feed.refetch()}
            tintColor={colors.accent.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default CategoryScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  item: {
    paddingHorizontal: layout.screenPadding,
    marginBottom: spacing.section,
  },
  skeletons: { paddingHorizontal: layout.screenPadding, gap: spacing.section },
  footer: { paddingVertical: spacing.xl },
});
