import { useDockInset } from '@/components/navigation/useDockInset';
import { useState } from 'react';
import {
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { CategoryChip } from '@/components/ui/CategoryChip';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { VideoRow } from '@/components/video';
import { colors, layout, spacing } from '@/css';
import { CategoryRow } from '@/features/home/CategoryRow';
import { useCategories } from '@/hooks/queries/useCategories';
import { useTrending } from '@/hooks/queries/useTrending';
import type { VideoCardData } from '@/types/video';

// windowDays is sent to the backend (it accepts 1..90). These are just the presets we offer.
const WINDOWS = [
  { label: 'Today', days: 1 },
  { label: 'This week', days: 7 },
  { label: 'This month', days: 30 },
];

const TrendingScreen = () => {
  const dockInset = useDockInset(); // keeps the last items clear of the floating dock
  const [days, setDays] = useState(7);
  const [categoryId, setCategoryId] = useState<string | undefined>(undefined);

  const categories = useCategories();
  const trending = useTrending('LONG_FORM', categoryId, days, 50);

  const header = (
    <View style={styles.filters}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.windows}
      >
        {WINDOWS.map((window) => (
          <CategoryChip
            key={window.days}
            label={window.label}
            selected={days === window.days}
            onPress={() => setDays(window.days)}
          />
        ))}
      </ScrollView>
      <CategoryRow
        categories={categories.data}
        loading={categories.isPending}
        selectedId={categoryId}
        onSelect={setCategoryId}
      />
    </View>
  );

  const empty = trending.isPending ? (
    <View style={styles.skeletons}>
      {[0, 1, 2, 3, 4].map((key) => (
        <View key={key} style={styles.skeletonRow}>
          <Skeleton width={150} height={84} radius='md' />
          <View style={styles.skeletonText}>
            <Skeleton width='90%' height={14} />
            <Skeleton width='60%' height={12} />
          </View>
        </View>
      ))}
    </View>
  ) : trending.isError ? (
    <ErrorState error={trending.error} onRetry={() => trending.refetch()} />
  ) : (
    <EmptyState
      icon='flame-outline'
      title='Nothing trending'
      message='No videos were published in this window. Try a longer range.'
    />
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title='Trending' />
      <FlatList<VideoCardData>
        data={trending.isPending || trending.isError ? [] : trending.data}
        keyExtractor={(video) => video.id}
        renderItem={({ item, index }) => (
          <View style={styles.item}>
            <VideoRow video={item} rank={index + 1} />
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={{ paddingBottom: dockInset }}
        refreshControl={
          <RefreshControl
            refreshing={trending.isRefetching}
            onRefresh={() => trending.refetch()}
            tintColor={colors.accent.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default TrendingScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  filters: { gap: spacing.md, paddingBottom: spacing.lg },
  windows: { paddingHorizontal: layout.screenPadding, gap: spacing.sm },
  item: { paddingHorizontal: layout.screenPadding, marginBottom: spacing.lg },
  skeletons: { gap: spacing.lg, paddingHorizontal: layout.screenPadding },
  skeletonRow: { flexDirection: 'row', gap: spacing.md },
  skeletonText: { flex: 1, gap: spacing.sm, justifyContent: 'center' },
});
