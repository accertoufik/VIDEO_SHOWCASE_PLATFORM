import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused, useRouter } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { AppText } from '@/components/ui/Text';
import { colors, layout, spacing } from '@/css';
import { ShortItem } from '@/features/shorts/ShortItem';
import { useShorts } from '@/hooks/queries/useShorts';
import { useAppActive } from '@/hooks/useAppActive';
import type { VideoCardData } from '@/types/video';
import { uniqueById } from '@/utils/collection';
// Once every page is loaded the list repeats itself this many times, so swiping up never reaches an end: after the
// last short comes the first again. (Pages still loading are appended at the end, so nothing shifts under the viewer.)
const LOOP_REPEATS = 100;

type Slot = { key: string; video: VideoCardData };

const ShortsScreen = () => {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const router = useRouter();
  const appActive = useAppActive();
  const query = useShorts();

  const [height, setHeight] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);

  const videos = useMemo(
    () => uniqueById(query.data?.pages.flatMap((page) => page.videos) ?? []),
    [query.data],
  );

  const slots = useMemo<Slot[]>(() => {
    if (videos.length === 0) return [];
    const count = query.hasNextPage ? videos.length : videos.length * LOOP_REPEATS;
    return Array.from({ length: count }, (_, i) => ({
      key: String(i),
      video: videos[i % videos.length] as VideoCardData,
    }));
  }, [videos, query.hasNextPage]);

  // FlatList requires these two to be referentially stable.
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const current = viewableItems.find((token) => token.isViewable);
      if (current?.index != null) setActiveIndex(current.index);
    },
  ).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;

  const screenActive = focused && appActive;

  let body;
  if (query.isPending) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator size='large' color={colors.accent.text} />
      </View>
    );
  } else if (query.isError) {
    body = (
      <View style={styles.center}>
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </View>
    );
  } else if (!videos.length) {
    body = (
      <View style={styles.center}>
        <EmptyState
          icon='play-circle-outline'
          title='No shorts yet'
          message='Short videos will appear here.'
        />
      </View>
    );
  } else if (height > 0) {
    body = (
      <FlatList<Slot>
        data={slots}
        keyExtractor={(slot) => slot.key}
        renderItem={({ item, index }) => (
          <ShortItem
            video={item.video}
            height={height}
            active={index === activeIndex}
            preload={index === activeIndex + 1}
            screenActive={screenActive}
            muted={muted}
          />
        )}
        // One short per screen, snapping like a pager.
        pagingEnabled
        snapToInterval={height}
        snapToAlignment='start'
        decelerationRate='fast'
        getItemLayout={(_, index) => ({
          length: height,
          offset: height * index,
          index,
        })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        showsVerticalScrollIndicator={false}
        initialNumToRender={1}
        maxToRenderPerBatch={2}
        windowSize={3}
        removeClippedSubviews
        onEndReached={() =>
          query.hasNextPage &&
          !query.isFetchingNextPage &&
          query.fetchNextPage()
        }
        onEndReachedThreshold={2}
      />
    );
  }

  return (
    <View
      style={styles.root}
      // Never let the page get SHORTER. Opening the keyboard (typing a comment) shrinks this area; with a smaller page
      // height every short's size and the scroll position change under the viewer, the list slides to the next
      // short, that one becomes "active", and the comments (tied to the previous short) close by themselves.
      onLayout={(event) => {
        const next = event.nativeEvent.layout.height;
        setHeight((prev) => (prev === 0 ? next : Math.max(prev, next)));
      }}
    >
      {body}

      {/* Soft scrim so the title and buttons stay readable over any video. */}
      <LinearGradient
        colors={[colors.overlay.scrimStrong, 'transparent']}
        pointerEvents='none'
        style={[styles.topScrim, { height: insets.top + 96 }]}
      />
      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]} pointerEvents='box-none'>
        <AppText variant='h2' accessibilityRole='header'>
          Shorts
        </AppText>
        <View style={styles.topActions}>
          <Pressable
            onPress={() => router.push('/search')}
            hitSlop={8}
            style={styles.topButton}
            accessibilityRole='button'
            accessibilityLabel='Search'
          >
            <Ionicons name='search' size={22} color={colors.text.primary} />
          </Pressable>
          <Pressable
            onPress={() => setMuted((v) => !v)}
            hitSlop={8}
            style={styles.topButton}
            accessibilityRole='button'
            accessibilityLabel={muted ? 'Unmute' : 'Mute'}
          >
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={22} color={colors.text.primary} />
          </Pressable>
        </View>
      </View>
    </View>
  );
};

export default ShortsScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.player },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
  },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
  },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  topButton: {
    width: layout.minTouchTarget - 4,
    height: layout.minTouchTarget - 4,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay.scrim,
  },
});
