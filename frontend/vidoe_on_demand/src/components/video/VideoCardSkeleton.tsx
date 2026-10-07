import { StyleSheet, View } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';
import { spacing } from '@/css';

export const VideoCardSkeleton = () => (
  <View
    accessibilityElementsHidden
    importantForAccessibility='no-hide-descendants'
  >
    <Skeleton width='100%' height={200} radius='lg' />
    <View style={styles.meta}>
      <Skeleton width={36} height={36} radius='pill' />
      <View style={styles.text}>
        <Skeleton width='85%' height={16} />
        <Skeleton width='55%' height={12} />
      </View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  meta: { flexDirection: 'row', gap: spacing.md, paddingTop: spacing.md },
  text: { flex: 1, gap: spacing.sm },
});
