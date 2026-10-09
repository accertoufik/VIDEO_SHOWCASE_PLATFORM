import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { GestureDetector } from 'react-native-gesture-handler';
import { usePagerRowGesture } from '@/components/ui/pagerRows';
import {
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useDockInset } from '@/components/navigation/useDockInset';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassButton } from '@/components/ui/GlassButton';
import { VideoRow, VideoTile } from '@/components/video';
import { colors, layout, spacing } from '@/css';
import {
  useClearHistory,
  useRemoveFromHistory,
} from '@/hooks/mutations/useHistoryMutations';
import {
  useContinueWatching,
  useFollowers,
  useFollowing,
  useHistory,
  useLikedVideos,
  useSavedVideos,
} from '@/hooks/queries/useLibrary';
import { CreatorResultRow } from '@/features/search/CreatorResultRow';
import { SectionHeader } from '@/features/home/SectionHeader';
import type { LibraryVideo } from '@/types/library';
import { FollowerRow } from './FollowerRow';
import { PagedList } from './PagedList';

const videoKey = (item: LibraryVideo) => item.key;
const percentOf = (item: LibraryVideo) =>
  item.progress && !item.progress.completed
    ? item.progress.completionPercent
    : undefined;

const OVERVIEW_PREVIEW = 10; // tiles per row on the Overview (the lists themselves load 20 per page)

export type LibraryTab =
  | 'overview'
  | 'continue'
  | 'history'
  | 'liked'
  | 'saved'
  | 'following'
  | 'followers'
  | 'downloads';

export const ContinuePane = () => {
  const query = useContinueWatching();
  return (
    <PagedList
      query={query}
      keyOf={videoKey}
      renderItem={(item) => (
        <VideoRow video={item.video} progressPercent={percentOf(item)} />
      )}
      empty={{
        icon: 'play-circle-outline',
        title: 'Nothing to continue',
        message: "Videos you start but don't finish will wait for you here.",
      }}
    />
  );
};

export const HistoryPane = () => {
  const query = useHistory();
  const remove = useRemoveFromHistory();
  const clear = useClearHistory();

  const confirmClear = () =>
    Alert.alert(
      'Clear watch history?',
      "This also removes your resume points. It can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => clear.mutate() },
      ],
    );

  const hasItems = Boolean(query.data?.pages.some((page) => page.items.length));

  return (
    <PagedList
      query={query}
      keyOf={videoKey}
      header={
        hasItems ? (
          <View style={styles.clear}>
            <GlassButton
              label='Clear history'
              variant='ghost'
              size='sm'
              loading={clear.isPending}
              onPress={confirmClear}
            />
          </View>
        ) : null
      }
      renderItem={(item) => (
        <VideoRow
          video={item.video}
          progressPercent={percentOf(item)}
          trailing={
            <Pressable
              onPress={() => remove.mutate(item.video.id)}
              hitSlop={10}
              style={styles.remove}
              accessibilityRole='button'
              accessibilityLabel={`Remove ${item.video.title} from history`}
            >
              <Ionicons name='close' size={20} color={colors.text.muted} />
            </Pressable>
          }
        />
      )}
      empty={{
        icon: 'time-outline',
        title: 'No watch history',
        message: 'Videos you watch will show up here.',
      }}
    />
  );
};

export const LikedPane = () => (
  <PagedList
    query={useLikedVideos()}
    keyOf={videoKey}
    renderItem={(item) => <VideoRow video={item.video} />}
    empty={{
      icon: 'heart-outline',
      title: 'No liked videos',
      message: 'Tap the heart on a video to keep it here.',
    }}
  />
);

export const SavedPane = () => (
  <PagedList
    query={useSavedVideos()}
    keyOf={videoKey}
    renderItem={(item) => <VideoRow video={item.video} />}
    empty={{
      icon: 'bookmark-outline',
      title: 'Nothing saved',
      message: 'Save videos to watch them later.',
    }}
  />
);

export const FollowingPane = () => (
  <PagedList
    query={useFollowing()}
    keyOf={(creator) => creator.id}
    renderItem={(creator) => <CreatorResultRow creator={creator} />}
    empty={{
      icon: 'people-outline',
      title: 'Not following anyone',
      message: 'Follow creators to find them here.',
    }}
  />
);

export const FollowersPane = () => (
  <PagedList
    query={useFollowers()}
    keyOf={(follower) => follower.id}
    renderItem={(follower) => <FollowerRow follower={follower} />}
    empty={{
      icon: 'people-outline',
      title: 'No followers yet',
      message: 'People who follow you will appear here.',
    }}
  />
);

export const DownloadsPane = () => {
  const router = useRouter();
  return (
    <View style={styles.downloads}>
      <EmptyState
        icon='download-outline'
        title='Downloads live on this device'
        message='Open the Downloads tab to see videos saved for offline viewing.'
      />
      <GlassButton
        label='Open Downloads'
        icon='download-outline'
        variant='primary'
        onPress={() => router.push('/downloads')}
      />
    </View>
  );
};

type RowProps = {
  title: string;
  items: LibraryVideo[];
  onSeeAll: () => void;
  showProgress?: boolean;
};

const TileRow = ({ title, items, onSeeAll, showProgress }: RowProps) => {
  // The page swipe (Overview -> Continue -> ...) yields to this row's own sideways scrolling.
  const rowGesture = usePagerRowGesture();
  if (!items.length) return null;
  return (
    <View style={styles.section}>
      <SectionHeader title={title} actionLabel='See all' onAction={onSeeAll} />
      <GestureDetector gesture={rowGesture}>
        <View>
          <FlatList
            horizontal
            data={items}
            keyExtractor={videoKey}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tiles}
            renderItem={({ item }) => (
              <VideoTile
                video={item.video}
                progressPercent={showProgress ? percentOf(item) : undefined}
              />
            )}
          />
        </View>
      </GestureDetector>
    </View>
  );
};

/** First screen of the dashboard: a preview of each list. "See all" jumps to that tab. */
export const OverviewPane = ({
  onSelect,
}: {
  onSelect: (tab: LibraryTab) => void;
}) => {
  const dockInset = useDockInset();
  const continuing = useContinueWatching();
  const history = useHistory();
  const liked = useLikedVideos();
  const saved = useSavedVideos();

  const first = (q: { data?: { pages: Array<{ items: LibraryVideo[] }> } }) =>
    (q.data?.pages[0]?.items ?? []).slice(0, OVERVIEW_PREVIEW);
  const lists = {
    continuing: first(continuing),
    history: first(history),
    liked: first(liked),
    saved: first(saved),
  };
  const loading = [continuing, history, liked, saved].some((q) => q.isPending);
  const allEmpty =
    !loading && Object.values(lists).every((items) => items.length === 0);

  return (
    <ScrollView
      contentContainerStyle={{
        paddingTop: spacing.lg,
        paddingBottom: dockInset,
      }}
      showsVerticalScrollIndicator={false}
    >
      <TileRow
        title='Continue watching'
        items={lists.continuing}
        showProgress
        onSeeAll={() => onSelect('continue')}
      />
      <TileRow
        title='History'
        items={lists.history}
        onSeeAll={() => onSelect('history')}
      />
      <TileRow
        title='Liked'
        items={lists.liked}
        onSeeAll={() => onSelect('liked')}
      />
      <TileRow
        title='Saved'
        items={lists.saved}
        onSeeAll={() => onSelect('saved')}
      />
      {allEmpty ? (
        <View style={styles.padded}>
          <EmptyState
            icon='albums-outline'
            title='Your library is empty'
            message="Watch, like and save videos and they'll collect here."
          />
        </View>
      ) : null}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  clear: { alignItems: 'flex-end', paddingBottom: spacing.md },
  remove: {
    minWidth: layout.minTouchTarget,
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: { paddingBottom: spacing.section },
  tiles: { paddingHorizontal: layout.screenPadding, gap: spacing.md },
  padded: { paddingHorizontal: layout.screenPadding },
  downloads: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xl,
    paddingHorizontal: layout.screenPadding,
  },
});
