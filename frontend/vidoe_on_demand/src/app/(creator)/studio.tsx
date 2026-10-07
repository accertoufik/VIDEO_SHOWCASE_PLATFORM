import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { SwipePager } from '@/components/ui/SwipePager';
import { colors } from '@/css';
import { CommentsPage } from '@/features/studio/pages/CommentsPage';
import { ContentPage } from '@/features/studio/pages/ContentPage';
import { OverviewPage } from '@/features/studio/pages/OverviewPage';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'content', label: 'Content' },
  { key: 'comments', label: 'Comments' },
] as const;

// Overview | Content | Comments: tap a chip or swipe the screen left and right.
// /studio?tab=content and /studio?tab=comments&videoId=... open a given section directly.
const StudioScreen = () => {
  const { tab, videoId } = useLocalSearchParams<{ tab?: string; videoId?: string }>();
  const router = useRouter();
  const index = Math.max(0, TABS.findIndex((t) => t.key === tab));

  return (
    <View style={styles.root}>
      <ScreenHeader title='Creator Studio' />
      <SwipePager
        tabs={TABS}
        index={index}
        onIndexChange={(i) => router.setParams({ tab: TABS[i]?.key })}
        renderPage={(key) =>
          key === 'content' ? <ContentPage /> : key === 'comments' ? <CommentsPage videoId={videoId} /> : <OverviewPage />
        }
      />
    </View>
  );
};

export default StudioScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
});
