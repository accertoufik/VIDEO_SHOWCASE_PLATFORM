import { startTransition, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Chip } from '@/features/upload/Chip';
import { PagerRowTouchContext } from './pagerRows';
import { layout, spacing } from '@/css';

type Tab = { key: string; label: string };

type Props = {
  tabs: readonly Tab[];
  /** Index to show (also lets a deep link or param jump to a tab). */
  index?: number;
  renderPage: (key: string) => ReactNode;
  onIndexChange?: (index: number) => void;
};

const SNAP_MS = 220;
// A drag becomes a page turn only once it is clearly sideways; if it moves up/down first, the gesture gives up and the
// page's own list scrolls. That lock is what stops a sideways swipe from also scrolling the page vertically.
const H_ACTIVATE = 14;
const V_FAIL = 10;

/**
 * Tabs you can tap or swipe between. The page follows your finger (a Reanimated-driven row of pages), and only the
 * area under the chips moves: the header and chips stay put. Pages mount on first visit and then stay mounted.
 */
export const SwipePager = ({ tabs, index = 0, renderPage, onIndexChange }: Props) => {
  const tabRow = useRef<ScrollView>(null);
  const chipX = useRef<Array<{ x: number; w: number }>>([]);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(index);
  const [visited, setVisited] = useState<Set<number>>(() => new Set([index]));

  const offset = useSharedValue(0); // translateX of the page row
  const startOffset = useSharedValue(0);
  const pageWidth = useSharedValue(0);
  const count = tabs.length;

  // The highlighted chip is urgent; mounting a page's (possibly heavy) content is not, so it goes in a transition and
  // never delays the chip or the slide.
  const markVisited = useCallback((i: number) => {
    setActive(i);
    startTransition(() => setVisited((prev) => (prev.has(i) ? prev : new Set(prev).add(i))));
  }, []);

  // While dragging, the chip switches as soon as the page is more than half way across (not after you let go), and the
  // page you are heading to is mounted early so its content is ready when it arrives.
  const followDrag = useCallback((i: number) => {
    setActive((prev) => (prev === i ? prev : i));
    startTransition(() => setVisited((prev) => (prev.has(i) ? prev : new Set(prev).add(i))));
  }, []);

  const go = useCallback(
    (next: number, animated: boolean) => {
      markVisited(next);
      if (pageWidth.value > 0) {
        offset.value = animated ? withTiming(-next * pageWidth.value, { duration: SNAP_MS }) : -next * pageWidth.value;
      }
    },
    [markVisited, offset, pageWidth],
  );

  const settled = useCallback(
    (next: number) => {
      markVisited(next);
      onIndexChange?.(next);
    },
    [markVisited, onIndexChange],
  );

  // 1 while a finger is on a sideways-scrolling row inside a page (see pagerRows.ts): the page swipe must not start then.
  const rowTouch = useSharedValue(0);
  const downX = useSharedValue(0);
  const downY = useSharedValue(0);

  const pan = Gesture.Pan()
    // Manual activation = we decide, so a drag that begins on a row, or goes up/down first, never turns the page.
    .manualActivation(true)
    .onTouchesDown((e) => {
      const t = e.changedTouches[0];
      if (t) {
        downX.value = t.absoluteX;
        downY.value = t.absoluteY;
      }
    })
    .onTouchesMove((e, state) => {
      const t = e.changedTouches[0];
      if (!t) return;
      if (rowTouch.value === 1) {
        state.fail();
        return;
      }
      const dx = Math.abs(t.absoluteX - downX.value);
      const dy = Math.abs(t.absoluteY - downY.value);
      if (dy > V_FAIL && dy >= dx) state.fail();
      else if (dx > H_ACTIVATE && dx > dy) state.activate();
    })
    .onStart(() => {
      startOffset.value = offset.value;
    })
    .onUpdate((e) => {
      const min = -(count - 1) * pageWidth.value;
      offset.value = Math.min(0, Math.max(min, startOffset.value + e.translationX));
    })
    .onEnd((e) => {
      const w = pageWidth.value;
      if (w <= 0) return;
      // Project the fling a little so a quick flick turns the page even if the drag was short.
      const projected = offset.value + e.velocityX * 0.12;
      const target = Math.min(count - 1, Math.max(0, Math.round(-projected / w)));
      offset.value = withTiming(-target * w, { duration: SNAP_MS });
      runOnJS(settled)(target);
    });

  useAnimatedReaction(
    () => (pageWidth.value > 0 ? Math.min(count - 1, Math.max(0, Math.round(-offset.value / pageWidth.value))) : 0),
    (next, prev) => {
      if (prev !== null && next !== prev) runOnJS(followDrag)(next);
    },
  );

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setWidth(w);
    setHeight(h);
    pageWidth.value = w;
    offset.value = -active * w;
  };

  // Keep the active chip in view when there are more chips than fit on screen.
  useEffect(() => {
    const chip = chipX.current[active];
    if (chip && width > 0) tabRow.current?.scrollTo({ x: Math.max(0, chip.x - (width - chip.w) / 2), animated: true });
  }, [active, width]);

  // A new `index` from outside (e.g. ?tab=comments) jumps there. Skipped when a tap/swipe already got there.
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    if (index !== activeRef.current) go(index, false);
  }, [index, go]);

  return (
    <View style={styles.root}>
      <ScrollView
        ref={tabRow}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScroll}
        contentContainerStyle={styles.tabs}
        accessibilityRole='tablist'
      >
        {tabs.map((tab, i) => (
          <View
            key={tab.key}
            onLayout={(e) => {
              chipX.current[i] = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
            }}
          >
            <Chip
              label={tab.label}
              selected={i === active}
              onPress={() => {
                go(i, true);
                onIndexChange?.(i);
              }}
            />
          </View>
        ))}
      </ScrollView>

      <View style={styles.pagerBox} onLayout={onLayout}>
        {width > 0 && height > 0 ? (
          <PagerRowTouchContext.Provider value={rowTouch}>
          <GestureDetector gesture={pan}>
            <Animated.View style={[styles.row, { width: width * count, height }, rowStyle]}>
              {tabs.map((tab, i) => (
                <View key={tab.key} style={{ width, height }}>
                  {visited.has(i) ? renderPage(tab.key) : null}
                </View>
              ))}
            </Animated.View>
          </GestureDetector>
          </PagerRowTouchContext.Provider>
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
  tabsScroll: { flexGrow: 0 },
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
  },
  pagerBox: { flex: 1, overflow: 'hidden' },
  row: { flexDirection: 'row' },
});
