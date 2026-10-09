import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SwipePager } from '@/components/ui/SwipePager';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { colors } from '@/css';
import {
  ContinuePane,
  DownloadsPane,
  FollowersPane,
  FollowingPane,
  HistoryPane,
  LikedPane,
  OverviewPane,
  SavedPane,
  type LibraryTab,
} from '@/features/dashboard/LibraryPanes';
import { LIBRARY_KEY } from '@/hooks/queries/useLibrary';

const TABS: Array<{ tab: LibraryTab; label: string }> = [
  { tab: 'overview', label: 'Overview' },
  { tab: 'continue', label: 'Continue' },
  { tab: 'history', label: 'History' },
  { tab: 'liked', label: 'Liked' },
  { tab: 'saved', label: 'Saved' },
  { tab: 'following', label: 'Following' },
  { tab: 'followers', label: 'Followers' },
  { tab: 'downloads', label: 'Downloads' },
];

const DashboardScreen = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<LibraryTab>('overview');

  // Coming back from a video: resume points, history and likes may have changed.
  // The first focus is the screen opening: its lists are already loading, so invalidating would refetch
  // them a second time. Only later focuses (returning from a video) need a refresh.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      qc.invalidateQueries({ queryKey: LIBRARY_KEY });
    }, [qc]),
  );

  return (
    <View style={styles.root}>
      <ScreenHeader title='Your library' />
      {/* Swipe left/right between sections (or tap a chip). A section loads when first opened. */}
      <SwipePager
        tabs={TABS.map((t) => ({ key: t.tab, label: t.label }))}
        index={Math.max(0, TABS.findIndex((t) => t.tab === tab))}
        onIndexChange={(i) => setTab(TABS[i]?.tab ?? 'overview')}
        renderPage={(key) => {
          switch (key as LibraryTab) {
            case 'continue':
              return <ContinuePane />;
            case 'history':
              return <HistoryPane />;
            case 'liked':
              return <LikedPane />;
            case 'saved':
              return <SavedPane />;
            case 'following':
              return <FollowingPane />;
            case 'followers':
              return <FollowersPane />;
            case 'downloads':
              return <DownloadsPane />;
            default:
              return <OverviewPane onSelect={setTab} />;
          }
        }}
      />
    </View>
  );
};

export default DashboardScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
});
