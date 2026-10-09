import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useDockInset } from '@/components/navigation/useDockInset';
import { ProfileHeader } from '@/features/profile/ProfileHeader';
import { Ionicons } from '@expo/vector-icons';
import { EmptyHero } from '@/components/ui/EmptyHero';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassIconButton } from '@/components/ui/GlassIconButton';
import { Screen } from '@/components/ui/Screen';
import { SwipeContent } from '@/components/ui/SwipeContent';
import { ProfileSkeleton, ScreenSkeleton } from '@/components/ui/skeletons';
import { AppText } from '@/components/ui/Text';
import { CategoryChip } from '@/components/ui/CategoryChip';
import { ShortTile, VideoCard, VideoCardSkeleton } from '@/components/video';
import { colors, layout, radii, spacing } from '@/css';
import { useCreatorPage, useCreatorVideos, useToggleFollow } from '@/hooks/queries/useCreator';
import { useAuthGate } from '@/lib/auth/useAuthGate';
import type { UseInfiniteQueryResult, InfiniteData } from '@tanstack/react-query';
import type { VideoCardData } from '@/types/video';
import { uniqueById } from '@/utils/collection';
import { formatCount } from '@/utils/format';

// Side margin of the video section: smaller than the page padding, so the cards are as wide as on the Home feed.
const SIDE = spacing.md;

const TAB_KEYS = ['videos', 'shorts'] as const;

const CreatorScreen = () => {
  const router = useRouter();
  const dockInset = useDockInset();
  const { width: screenWidth } = useWindowDimensions();
  // Two Shorts per row, with explicit pixel widths (percent widths collapsed to one column inside the swipe area).
  const shortWidth = (Math.min(screenWidth, layout.maxContentWidth) - SIDE * 2 - spacing.md) / 2;
  const { username } = useLocalSearchParams<{ username: string }>();
  const ensureSignedIn = useAuthGate();

  const page = useCreatorPage(username);
  const creatorId = page.data?.creator?.id;
  // Two sections, like the rest of the app: full-length Videos and vertical Shorts. Swipe the section (not the
  // whole page) or tap a chip to switch.
  const [tab, setTab] = useState<(typeof TAB_KEYS)[number]>('videos');
  const longForm = useCreatorVideos(creatorId, 'LONG_FORM');
  const shortForm = useCreatorVideos(creatorId, 'SHORT_FORM');
  const toggleFollow = useToggleFollow(username, creatorId);

  const longItems = useMemo(() => uniqueById(longForm.data?.pages.flatMap((p) => p.videos) ?? []), [longForm.data]);
  const shortItems = useMemo(() => uniqueById(shortForm.data?.pages.flatMap((p) => p.videos) ?? []), [shortForm.data]);

  const onFollow = () => {
    if (!ensureSignedIn() || toggleFollow.isPending) return;
    toggleFollow.mutate(!page.data?.isFollowing);
  };

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));

  // The page itself scrolls; near the bottom, load more of the section that is showing.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height < contentSize.height - 600) return;
    const q = tab === 'videos' ? longForm : shortForm;
    if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage();
  };

  if (page.isPending)
    return (
      <ScreenSkeleton title='Channel'>
        <ProfileSkeleton />
      </ScreenSkeleton>
    );

  if (page.isError || !page.data) {
    return (
      <Screen>
        <View style={styles.top}>
          <GlassIconButton icon='chevron-back' label='Back' onPress={back} />
        </View>
        <ErrorState error={page.error} onRetry={() => page.refetch()} />
      </Screen>
    );
  }

  const c = page.data;
  const about = c.creator?.aboutText ?? c.biography;

  const section = (
    q: UseInfiniteQueryResult<InfiniteData<unknown>, Error>,
    items: VideoCardData[],
    kind: 'videos' | 'shorts',
  ) => {
    if (q.isPending)
      return (
        <View style={styles.skeletons}>
          {[0, 1].map((key) => (
            <VideoCardSkeleton key={key} />
          ))}
        </View>
      );
    if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
    if (items.length === 0)
      return (
        <EmptyHero
          icon={kind === 'videos' ? 'videocam-outline' : 'flash-outline'}
          title={kind === 'videos' ? 'Nothing uploaded yet' : 'No Shorts here yet'}
        />
      );
    return (
      <View style={kind === 'shorts' ? styles.shortsGrid : styles.grid}>
        {items.map((video) =>
          kind === 'shorts' ? (
            <View key={video.id} style={[styles.shortCell, { width: shortWidth }]}>
              <ShortTile video={video} style={styles.shortFill} />
            </View>
          ) : (
            <View key={video.id} style={styles.item}>
              <VideoCard video={video} hideCreator />
            </View>
          ),
        )}
        {q.isFetchingNextPage ? <ActivityIndicator style={styles.footer} color={colors.accent.text} /> : null}
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <ScrollView
        keyboardShouldPersistTaps='handled'
        onScroll={onScroll}
        scrollEventThrottle={100}
        contentContainerStyle={{ paddingBottom: dockInset }}
        showsVerticalScrollIndicator={false}
      >
        <Screen style={styles.headerScreen}>
          <View style={styles.top}>
            <GlassIconButton icon='chevron-back' label='Back' onPress={back} />
          </View>
          <View style={styles.identity}>
            <ProfileHeader
              name={c.displayName}
              username={c.username}
              avatarUrl={c.avatarUrl}
              bannerUrl={c.bannerUrl}
              bio={about}
              stats={
                c.creator
                  ? [{ label: c.followerCount === 1 ? 'Follower' : 'Followers', value: formatCount(c.followerCount) }]
                  : undefined
              }
            />
            {c.creator?.channelName && c.creator.channelName !== c.displayName ? (
              <AppText variant='bodySmall' color='muted'>
                Channel: {c.creator.channelName}
              </AppText>
            ) : null}
            {c.creator && !c.isOwnChannel ? (
              <GlassButton
                label={c.isFollowing ? 'Following' : 'Follow'}
                variant={c.isFollowing ? 'glass' : 'primary'}
                icon={c.isFollowing ? 'checkmark' : 'add'}
                fullWidth
                onPress={onFollow}
              />
            ) : null}
            {c.isOwnChannel ? (
              <GlassButton
                label='Edit channel'
                variant='glass'
                icon='create-outline'
                fullWidth
                onPress={() => router.push('/become-creator')}
              />
            ) : null}
          </View>
          {c.creator ? (
            <View style={styles.tabs}>
              <CategoryChip label='Videos' selected={tab === 'videos'} onPress={() => setTab('videos')} />
              <CategoryChip label='Shorts' selected={tab === 'shorts'} onPress={() => setTab('shorts')} />
            </View>
          ) : null}
        </Screen>

        {c.creator ? (
          <SwipeContent
            index={TAB_KEYS.indexOf(tab)}
            onIndexChange={(i) => setTab(TAB_KEYS[i] ?? 'videos')}
            pages={[
              section(longForm as never, longItems, 'videos'),
              section(shortForm as never, shortItems, 'shorts'),
            ]}
          />
        ) : (
          <View style={styles.notCreator}>
            <Ionicons name='person-outline' size={40} color={colors.text.muted} />
            <AppText variant='h3' style={styles.center}>
              Not a creator yet
            </AppText>
            <AppText variant='bodySmall' color='secondary' style={styles.center}>
              This person has no channel or videos.
            </AppText>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default CreatorScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  headerScreen: { flex: 0 },
  // The cards carry their own side padding (item). It was applied twice, which made the cards narrow.
  grid: {},
  top: { alignItems: 'flex-start' },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.section },
  notCreator: {
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.elevated,
  },
  center: { textAlign: 'center' },
  identity: { gap: spacing.md, paddingTop: spacing.md },
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  shortsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    paddingHorizontal: SIDE,
  },
  // Inside a fixed-width cell the tile must size from its content, not from flex.
  shortFill: { flex: 0, maxWidth: '100%' },
  shortCell: { marginBottom: spacing.lg },
  item: { paddingHorizontal: SIDE, marginBottom: spacing.section },
  skeletons: { paddingHorizontal: SIDE, gap: spacing.section },
  footer: { paddingVertical: spacing.xl },
});
