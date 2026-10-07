import { useDockInset } from '@/components/navigation/useDockInset';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { ScreenSkeleton, StatGridSkeleton } from '@/components/ui/skeletons';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlassButton } from '@/components/ui/GlassButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { AppText } from '@/components/ui/Text';
import { colors, layout, radii, spacing } from '@/css';
import { RangeChips } from '@/features/studio/RangeChips';
import { StatCard } from '@/features/studio/StatCard';
import { ViewsChart } from '@/features/studio/ViewsChart';
import { useVideoAnalytics } from '@/hooks/queries/useStudio';

const DEFAULT_DAYS = 28;

const AnalyticsScreen = () => {
  const { videoId = '' } = useLocalSearchParams<{ videoId?: string }>();
  const router = useRouter();
  const dockInset = useDockInset(); // keeps the last items clear of the floating dock
  const [days, setDays] = useState(DEFAULT_DAYS);
  const analytics = useVideoAnalytics(videoId, days);

  if (!videoId) {
    return (
      <View style={styles.root}>
        <ScreenHeader title='Analytics' />
        <ErrorState
          error={new Error('No video selected.')}
          onRetry={() => router.replace('/content')}
        />
      </View>
    );
  }
  if (analytics.isPending)
    return (
      <ScreenSkeleton title='Analytics'>
        <StatGridSkeleton />
      </ScreenSkeleton>
    );

  if (analytics.isError) {
    return (
      <View style={styles.root}>
        <ScreenHeader title='Analytics' />
        <ErrorState
          error={analytics.error}
          onRetry={() => analytics.refetch()}
        />
      </View>
    );
  }

  const { title, lifetime, period, engagement, viewsByDay } = analytics.data;

  return (
    <View style={styles.root}>
      <ScreenHeader title='Analytics' />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: dockInset },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={analytics.isRefetching}
            onRefresh={() => analytics.refetch()}
            tintColor={colors.text.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <AppText variant='h2' numberOfLines={3}>
          {title}
        </AppText>

        <View style={styles.section}>
          <AppText variant='h3'>All time</AppText>
          <View style={styles.grid}>
            <StatCard label='Views' value={lifetime.views} icon='eye-outline' />
            <StatCard
              label='Likes'
              value={lifetime.likes}
              icon='heart-outline'
            />
            <StatCard
              label='Comments'
              value={lifetime.comments}
              icon='chatbubble-outline'
            />
            <StatCard
              label='Shares'
              value={lifetime.shares}
              icon='share-social-outline'
            />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <AppText variant='h3'>Last {days} days</AppText>
            <RangeChips days={days} onChange={setDays} />
          </View>
          <View style={styles.grid}>
            <StatCard label='Views' value={period.views} icon='eye-outline' />
            <StatCard
              label='Unique viewers'
              value={period.uniqueViewers}
              icon='person-outline'
            />
          </View>
          <View style={styles.card}>
            <ViewsChart data={viewsByDay} />
          </View>
        </View>

        <View style={styles.section}>
          <AppText variant='h3'>Engagement</AppText>
          <View style={styles.grid}>
            <StatCard
              label='Watchers'
              value={engagement.watchers}
              icon='play-circle-outline'
              hint='people who started it'
            />
            <StatCard
              label='Finished'
              value={engagement.completedCount}
              icon='checkmark-circle-outline'
              hint='watched to the end'
            />
          </View>
          <View
            style={styles.card}
            accessible
            accessibilityLabel={`Average watched: ${Math.round(engagement.averageCompletionPercent)} percent`}
          >
            <AppText variant='label' color='secondary'>
              Average watched
            </AppText>
            <AppText variant='h2'>
              {Math.round(engagement.averageCompletionPercent)}%
            </AppText>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  {
                    width: `${Math.min(100, Math.max(0, engagement.averageCompletionPercent))}%`,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        <GlassButton
          label='See comments on this video'
          variant='glass'
          fullWidth
          onPress={() =>
            router.push({ pathname: '/comments', params: { videoId } })
          }
        />
      </ScrollView>
    </View>
  );
};

export default AnalyticsScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.xl,
  },
  section: { gap: spacing.md },
  sectionHead: { gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.glassMedium,
  },
  track: {
    height: 8,
    borderRadius: radii.pill,
    overflow: 'hidden',
    backgroundColor: colors.surface.glassMedium,
  },
  fill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.accent.primary,
  },
});
