import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { CategoryChip } from '@/components/ui/CategoryChip';
import { spacing } from '@/css';
import type { CategorySummary } from '@/types/video';

export const TopicChips = ({
  categories,
}: {
  categories: CategorySummary[];
}) => {
  const router = useRouter();
  return (
    <View style={styles.wrap}>
      {categories.map((category) => (
        <CategoryChip
          key={category.id}
          label={category.name}
          selected={false}
          onPress={() =>
            router.push({
              pathname: '/category/[id]',
              params: { id: category.id },
            })
          }
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
