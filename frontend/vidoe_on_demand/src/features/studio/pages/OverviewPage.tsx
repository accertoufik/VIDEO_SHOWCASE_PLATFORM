import { useDockInset } from '@/components/navigation/useDockInset';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { EmptyNotice } from '@/components/ui/EmptyNotice';
import { ScreenSkeleton, StatGridSkeleton } from '@/components/ui/skeletons';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlassButton } from '@/components/ui/GlassButton';
import { AppText } from '@/components/ui/Text';
import { colors, layout, radii, spacing } from '@/css';
import { RangeChips } from '@/features/studio/RangeChips';
import { StatCard } from '@/features/studio/StatCard';
import { TopVideoRow } from '@/features/studio/TopVideoRow';
import { ViewsChart } from '@/features/studio/ViewsChart';
import { useMe } from '@/hooks/queries/useMe';
import { useStudioOverview } from '@/hooks/queries/useStudio';
import { useGreeting } from '@/hooks/useGreeting';

const DEFAULT_DAYS = 28;

export const OverviewPage = () => {
  const router = useRouter();
  const dockInset = useDockInset(); // keeps the last items clear of the floating dock
  const me = useMe();
  const greeting = useGreeting();
  const [days, setDays] = useState(DEFAULT_DAYS);
  const overview = useStudioOverview(days);

  const channel = me.data?.creatorProfile?.channelName ?? 'Creator';

  if (overview.isPending)
    return (
      <ScreenSkeleton>
        <StatGridSkeleton />
      </ScreenSkeleton>
    );

  if (overview.isError) {
    return (
      <View style={styles.root}>
          <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      </View>
    );
  }

  const { totals, period, viewsByDay, topVideos } = overview.data;

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: dockInset },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={overview.isRefetching}
            onRefresh={() => overview.refetch()}
            tintColor={colors.text.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <AppText variant='body' color='secondary'>
          {greeting}, {channel}
        </AppText>

        {totals.videos === 0 ? (
          <EmptyNotice
            icon='stats-chart-outline'
            title='Nothing to show yet'
            message='Upload your first video and your stats will appear here.'
            action={{ label: 'Upload a video', onPress: () => router.push('/upload') }}
          />
        ) : (
          <>
            <View style={styles.grid}>
              <StatCard
                label='Views'
                value={totals.views}
                icon='eye-outline'
                hint={`${period.views} in ${days} days`}
              />
              <StatCard
                label='Followers'
                value={totals.followers}
                icon='people-outline'
                hint={`+${period.newFollowers} in ${days} days`}
              />
              <StatCard
                label='Likes'
                value={totals.likes}
                icon='heart-outline'
              />
              <StatCard
                label='Comments'
                value={totals.comments}
                icon='chatbubble-outline'
              />
              <StatCard
                label='Shares'
                value={totals.shares}
                icon='share-social-outline'
              />
              <StatCard
                label='Videos'
                value={totals.videos}
                icon='videocam-outline'
              />
            </View>

            <View style={styles.section}>
              <View style={styles.sectionHead}>
                <AppText variant='h3'>Views over time</AppText>
                <RangeChips days={days} onChange={setDays} />
              </View>
              <View style={styles.card}>
                <ViewsChart data={viewsByDay} />
              </View>
            </View>

            <View style={styles.section}>
              <AppText variant='h3'>Top performing videos</AppText>
              {topVideos.length === 0 ? (
                <AppText variant='body' color='secondary'>
                  Videos appear here once they're ready.
                </AppText>
              ) : (
                topVideos.map((video, index) => (
                  <TopVideoRow
                    key={video.id}
                    video={video}
                    rank={index + 1}
                    onPress={(v) =>
                      router.push({
                        pathname: '/analytics',
                        params: { videoId: v.id },
                      })
                    }
                  />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};


const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  section: { gap: spacing.md },
  sectionHead: { gap: spacing.md },
  card: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface.glassMedium,
  },
});
