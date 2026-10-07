import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';
import { TrendingCard } from '@/components/video';
import { layout, spacing } from '@/css';
import type { VideoCardData } from '@/types/video';
import { SectionHeader } from './SectionHeader';

type Props = { videos: VideoCardData[] | undefined; loading: boolean };

export const TrendingSection = ({ videos, loading }: Props) => {
  const router = useRouter();

  // Trending is supplementary: hide it quietly if it errors or is empty rather than blocking Home.
  if (!loading && !videos?.length) return null;

  return (
    <View style={styles.root}>
      <SectionHeader
        title='Trending'
        actionLabel='See all'
        onAction={() => router.push('/trending')}
      />
      {loading ? (
        <View style={styles.skeletons}>
          <Skeleton width={260} height={146} radius='lg' />
          <Skeleton width={260} height={146} radius='lg' />
        </View>
      ) : (
        <FlatList
          horizontal
          data={videos}
          keyExtractor={(video) => video.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.content}
          renderItem={({ item, index }) => (
            <TrendingCard video={item} rank={index + 1} />
          )}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { paddingTop: spacing.section },
  content: { paddingHorizontal: layout.screenPadding, gap: spacing.md },
  skeletons: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
  },
});
