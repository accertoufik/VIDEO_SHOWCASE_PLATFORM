import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { VideoUnavailable } from '@/features/video/VideoUnavailable';
import { describeError } from '@/lib/errors/describeError';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Thumbnail, VideoRow } from '@/components/video';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { colors, layout, spacing } from '@/css';
import { useRelatedVideos } from '@/hooks/queries/useRelatedVideos';
import { useVideo } from '@/hooks/queries/useVideo';
import { findCachedCard } from '@/lib/query/findCachedCard';
import type { VideoDetail } from '@/types/video';
import { useGoBack } from '@/lib/navigation/useGoBack';
import { GlassIconButton } from '@/components/ui/GlassIconButton';
import { AppText } from '@/components/ui/Text';
import { VideoDetails } from '@/features/video/VideoDetails';

const VideoScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const goBack = useGoBack();
  const detail = useVideo(id, { pollHd: true });
  const related = useRelatedVideos(id);

  const qc = useQueryClient();
  // Anything already loaded (feed, trending, library) gives us the title/creator/thumbnail straight away.
  const card = useMemo(() => findCachedCard(qc, id), [qc, id]);

  if (detail.isError) {
    const kind = describeError(detail.error).kind;
    // Removed / private / bad link: a purpose-made page. Anything else (offline, server) keeps the retry screen.
    if (kind === 'notFound' || kind === 'forbidden') {
      return (
        <View style={styles.root}>
          <ScreenHeader title='' />
          <VideoUnavailable onBack={goBack} />
        </View>
      );
    }
    return (
      <View style={styles.root}>
        <ScreenHeader title='' />
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      </View>
    );
  }

  // The page itself no longer waits for the full video. Only the player area shows a loader until a FRESH
  // response arrives (so playback starts from the CURRENT resume position, not a cached one).
  const ready = Boolean(detail.data && detail.isFetchedAfterMount);
  const full = detail.data;

  const pageVideo: VideoDetail | null = full
    ? full.video
    : card
      ? {
          ...card,
          description: null,
          visibility: 'PUBLIC',
          status: '',
          hdReady: false,
          hasStream: false,
          canDownload: false,
          likeCount: 0,
          commentCount: 0,
          shareCount: 0,
          creator: { ...card.creator, followerCount: 0 },
          variants: [],
        }
      : null;
  const viewer = full?.viewer ?? null;

  return (
    <View style={styles.root}>
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: colors.background.player,
        }}
      >
        {ready && full ? (
          full.video.hasStream ? (
            <VideoPlayer
              key={full.video.id}
              video={full.video}
              viewer={full.viewer}
              onBack={goBack}
            />
          ) : (
            <View>
              <Thumbnail uri={full.video.thumbnailUrl} radius='sm' />
              <View style={styles.processing}>
                <AppText variant='title'>This video is still processing</AppText>
                <AppText variant='bodySmall' color='secondary'>
                  Check back in a few minutes.
                </AppText>
              </View>
              <View style={styles.back}>
                <GlassIconButton icon='chevron-back' label='Go back' onPress={goBack} />
              </View>
            </View>
          )
        ) : (
          <View>
            {card?.thumbnailUrl ? (
              <Thumbnail uri={card.thumbnailUrl} radius='sm' />
            ) : (
              <Skeleton width='100%' height={220} radius='sm' />
            )}
            <View style={styles.playerLoading} pointerEvents='none'>
              <ActivityIndicator size='large' color={colors.text.primary} />
            </View>
            <View style={styles.back}>
              <GlassIconButton icon='chevron-back' label='Go back' onPress={goBack} />
            </View>
          </View>
        )}
      </View>

      <FlatList
        data={related.data ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <VideoRow video={item} />
          </View>
        )}
        ListHeaderComponent={
          pageVideo ? (
            <VideoDetails video={pageVideo} viewer={viewer} loading={!ready} />
          ) : (
            <View style={styles.skeletonBody}>
              <Skeleton width='80%' height={22} />
              <Skeleton width='45%' height={14} />
            </View>
          )
        }
        ListEmptyComponent={
          related.isPending ? (
            <View style={styles.item}>
              <Skeleton width='100%' height={84} radius='md' />
            </View>
          ) : related.isError ? (
            <ErrorState
              error={related.error}
              onRetry={() => related.refetch()}
            />
          ) : (
            <EmptyState
              icon='film-outline'
              title='Nothing up next'
              message='No related videos yet.'
            />
          )
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default VideoScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  details: { padding: layout.screenPadding, gap: spacing.xs },
  item: { paddingHorizontal: layout.screenPadding, marginBottom: spacing.lg },
  skeletonBody: { padding: layout.screenPadding, gap: spacing.md },
  processing: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    backgroundColor: colors.overlay.scrimStrong,
    gap: spacing.xs,
  },
  back: { position: 'absolute', top: spacing.sm, left: spacing.md },
  playerLoading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay.scrimStrong,
  },
});
