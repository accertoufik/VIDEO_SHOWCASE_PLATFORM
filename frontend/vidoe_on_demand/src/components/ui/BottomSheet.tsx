import { useEffect, useState, type ReactNode } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, motion, radii, spacing } from '@/css';
import { GlassSurface } from './GlassSurface';
import { AppText } from './Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Fraction of screen height the sheet may use. */
  maxHeightRatio?: number;
  children: ReactNode;
};

// Slides up on a glass surface. Tap the backdrop or system back to close.
// (No drag-to-dismiss yet — it would add a gesture-handler dependency; add it in the polish phase if wanted.)
export const BottomSheet = ({
  visible,
  onClose,
  title,
  maxHeightRatio = 0.85,
  children,
}: Props) => {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      progress.value = withTiming(1, { duration: reduced ? 0 : motion.medium });
    } else if (mounted) {
      progress.value = withTiming(
        0,
        { duration: reduced ? 0 : motion.normal },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [height, 0]) },
    ],
  }));

  return (
    <Modal
      visible={mounted}
      transparent
      animationType='none'
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View
          style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole='button'
            accessibilityLabel='Close'
          />
        </Animated.View>

        <Animated.View style={[styles.sheetWrap, sheetStyle]}>
          <GlassSurface
            variant='strong'
            radius='xl'
            style={[styles.sheet, { maxHeight: height * maxHeightRatio }]}
          >
            <View
              style={[
                styles.content,
                { paddingBottom: insets.bottom + spacing.lg },
              ]}
            >
              <View style={styles.handle} />
              {title ? (
                <AppText variant='h3' style={styles.title}>
                  {title}
                </AppText>
              ) : null}
              {children}
            </View>
          </GlassSurface>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { backgroundColor: colors.overlay.scrim },
  sheetWrap: { width: '100%' },
  sheet: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    backgroundColor: colors.background.elevated,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surface.borderStrong,
  },
  title: { textAlign: 'center' },
});
