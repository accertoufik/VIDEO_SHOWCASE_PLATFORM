import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, spacing } from '@/css';

/** Bottom padding that keeps content clear of the floating dock. Use it in lists on tab screens. */
export const useDockInset = () => {
  const insets = useSafeAreaInsets();
  return (
    insets.bottom + layout.dock.height + layout.dock.bottomOffset + spacing.lg
  );
};
