import { FlatList, StyleSheet, View } from 'react-native';
import { CategoryChip } from '@/components/ui/CategoryChip';
import { Skeleton } from '@/components/ui/Skeleton';
import { layout, spacing } from '@/css';
import type { CategorySummary } from '@/types/video';

type Props = {
  categories: CategorySummary[] | undefined;
  loading: boolean;
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
};

type Item = { id: string; name: string };

export const CategoryRow = ({
  categories,
  loading,
  selectedId,
  onSelect,
}: Props) => {
  if (loading) {
    return (
      <View style={styles.skeletons}>
        {[72, 96, 84, 90].map((width, index) => (
          <Skeleton key={index} width={width} height={36} radius='pill' />
        ))}
      </View>
    );
  }
  // Categories are a nicety; if they fail to load, the feed still works without the row.
  if (!categories?.length) return null;

  const items: Item[] = [{ id: 'all', name: 'All' }, ...categories];

  return (
    <FlatList
      horizontal
      data={items}
      keyExtractor={(item) => item.id}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      renderItem={({ item }) => {
        const isAll = item.id === 'all';
        return (
          <CategoryChip
            label={item.name}
            selected={isAll ? selectedId === undefined : selectedId === item.id}
            onPress={() => onSelect(isAll ? undefined : item.id)}
          />
        );
      }}
    />
  );
};

const styles = StyleSheet.create({
  content: { paddingHorizontal: layout.screenPadding, gap: spacing.sm },
  skeletons: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
  },
});
