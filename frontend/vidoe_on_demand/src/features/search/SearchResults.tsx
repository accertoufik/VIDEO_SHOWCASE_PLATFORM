import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useDockInset } from '@/components/navigation/useDockInset';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { AppText } from '@/components/ui/Text';
import { VideoRow } from '@/components/video';
import { colors, layout, spacing } from '@/css';
import { SectionHeader } from '@/features/home/SectionHeader';
import { useCategories } from '@/hooks/queries/useCategories';
import {
  useSearchAll,
  useSearchCreators,
  useSearchTopics,
  useSearchVideos,
} from '@/hooks/queries/useSearch';
import type { SearchScope } from '@/types/search';
import { uniqueById } from '@/utils/collection';
import { CreatorResultRow } from './CreatorResultRow';
import { TopicChips } from './TopicChips';

type Props = {
  q: string;
  scope: SearchScope;
  onScope: (scope: SearchScope) => void;
};

const useBottomPad = () => useDockInset(); // clear the floating dock

const RowSkeletons = () => (
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
);

const NoResults = ({ q }: { q: string }) => (
  <EmptyState
    icon='search-outline'
    title='No results'
    message={`Nothing matched “${q}”. Try different words.`}
  />
);

// Idle state: nothing typed yet. Offer browsing by topic.
const BrowsePane = () => {
  const categories = useCategories();
  const bottom = useBottomPad();
  return (
    <ScrollView
      contentContainerStyle={[styles.pane, { paddingBottom: bottom }]}
      keyboardShouldPersistTaps='handled'
    >
      <AppText variant='h3'>Browse topics</AppText>
      {categories.isPending ? (
        <Skeleton width='100%' height={36} radius='pill' />
      ) : null}
      {categories.data ? <TopicChips categories={categories.data} /> : null}
      <AppText variant='bodySmall' color='muted'>
        Or type to search videos, creators and topics.
      </AppText>
    </ScrollView>
  );
};

const AllPane = ({ q, onScope }: { q: string; onScope: Props['onScope'] }) => {
  const search = useSearchAll(q);
  const bottom = useBottomPad();

  if (search.isPending) return <RowSkeletons />;
  if (search.isError)
    return <ErrorState error={search.error} onRetry={() => search.refetch()} />;

  const { videos, creators, categories, hasMoreVideos } = search.data;
  if (!videos.length && !creators.length && !categories.length)
    return <NoResults q={q} />;

  return (
    <ScrollView
      contentContainerStyle={[styles.paneWide, { paddingBottom: bottom }]}
      keyboardShouldPersistTaps='handled'
      keyboardDismissMode='on-drag'
    >
      {categories.length ? (
        <View style={styles.section}>
          <SectionHeader title='Topics' />
          <View style={styles.padded}>
            <TopicChips categories={categories} />
          </View>
        </View>
      ) : null}
      {creators.length ? (
        <View style={styles.section}>
          <SectionHeader
            title='Creators'
            actionLabel='See all'
            onAction={() => onScope('creators')}
          />
          <View style={[styles.padded, styles.list]}>
            {creators.map((creator) => (
              <CreatorResultRow key={creator.id} creator={creator} />
            ))}
          </View>
        </View>
      ) : null}
      {videos.length ? (
        <View style={styles.section}>
          <SectionHeader
            title='Videos'
            actionLabel={hasMoreVideos ? 'See all' : undefined}
            onAction={() => onScope('videos')}
          />
          <View style={[styles.padded, styles.list]}>
            {videos.map((video) => (
              <VideoRow key={video.id} video={video} />
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
};

const VideosPane = ({ q }: { q: string }) => {
  const search = useSearchVideos(q);
  const bottom = useBottomPad();
  const videos = uniqueById(
    search.data?.pages.flatMap((page) => page.videos) ?? [],
  );

  if (search.isPending) return <RowSkeletons />;
  if (search.isError)
    return <ErrorState error={search.error} onRetry={() => search.refetch()} />;

  return (
    <FlatList
      data={videos}
      keyExtractor={(video) => video.id}
      renderItem={({ item }) => <VideoRow video={item} />}
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      ListEmptyComponent={<NoResults q={q} />}
      ListFooterComponent={
        search.isFetchingNextPage ? (
          <ActivityIndicator
            style={styles.footer}
            color={colors.accent.text}
          />
        ) : null
      }
      contentContainerStyle={[
        styles.paneWide,
        styles.padded,
        { paddingBottom: bottom },
      ]}
      onEndReached={() =>
        search.hasNextPage &&
        !search.isFetchingNextPage &&
        search.fetchNextPage()
      }
      onEndReachedThreshold={0.6}
      keyboardShouldPersistTaps='handled'
      keyboardDismissMode='on-drag'
    />
  );
};

const CreatorsPane = ({ q }: { q: string }) => {
  const search = useSearchCreators(q);
  const bottom = useBottomPad();
  const creators = uniqueById(
    search.data?.pages.flatMap((page) => page.creators) ?? [],
  );

  if (search.isPending) return <RowSkeletons />;
  if (search.isError)
    return <ErrorState error={search.error} onRetry={() => search.refetch()} />;

  return (
    <FlatList
      data={creators}
      keyExtractor={(creator) => creator.id}
      renderItem={({ item }) => <CreatorResultRow creator={item} />}
      ItemSeparatorComponent={() => <View style={styles.gapLg} />}
      ListEmptyComponent={<NoResults q={q} />}
      ListFooterComponent={
        search.isFetchingNextPage ? (
          <ActivityIndicator
            style={styles.footer}
            color={colors.accent.text}
          />
        ) : null
      }
      contentContainerStyle={[
        styles.paneWide,
        styles.padded,
        { paddingBottom: bottom },
      ]}
      onEndReached={() =>
        search.hasNextPage &&
        !search.isFetchingNextPage &&
        search.fetchNextPage()
      }
      onEndReachedThreshold={0.6}
      keyboardShouldPersistTaps='handled'
      keyboardDismissMode='on-drag'
    />
  );
};

const TopicsPane = ({ q }: { q: string }) => {
  const search = useSearchTopics(q);
  const bottom = useBottomPad();

  if (search.isPending) return <RowSkeletons />;
  if (search.isError)
    return <ErrorState error={search.error} onRetry={() => search.refetch()} />;
  if (!search.data.length) return <NoResults q={q} />;

  return (
    <ScrollView
      contentContainerStyle={[styles.pane, { paddingBottom: bottom }]}
      keyboardShouldPersistTaps='handled'
    >
      <TopicChips categories={search.data} />
    </ScrollView>
  );
};

export const SearchResults = ({ q, scope, onScope }: Props) => {
  if (!q) return <BrowsePane />;
  if (scope === 'videos') return <VideosPane q={q} />;
  if (scope === 'creators') return <CreatorsPane q={q} />;
  if (scope === 'topics') return <TopicsPane q={q} />;
  return <AllPane q={q} onScope={onScope} />;
};

const styles = StyleSheet.create({
  pane: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  paneWide: { paddingTop: spacing.lg },
  padded: { paddingHorizontal: layout.screenPadding },
  section: { paddingBottom: spacing.section },
  list: { gap: spacing.lg },
  gap: { height: spacing.lg },
  gapLg: { height: spacing.xl },
  footer: { paddingVertical: spacing.xl },
  skeletons: {
    gap: spacing.lg,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
  },
  skeletonRow: { flexDirection: 'row', gap: spacing.md },
  skeletonText: { flex: 1, gap: spacing.sm, justifyContent: 'center' },
});
