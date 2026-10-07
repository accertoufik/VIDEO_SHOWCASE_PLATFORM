import { useEffect, useRef, useState, type ReactNode } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

type Props = {
  pages: ReactNode[];
  index: number;
  onIndexChange: (index: number) => void;
};

/**
 * A swipeable block that sits INSIDE a normally scrolling page (the rest of the page does not move sideways).
 * Its height follows the page being shown, so the outer page scrolls through it like any other content.
 */
export const SwipeContent = ({ pages, index, onIndexChange }: Props) => {
  const scroller = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<number[]>([]);
  const current = useRef(index);
  const boxHeight = useSharedValue(-1);
  const boxStyle = useAnimatedStyle(() => (boxHeight.value >= 0 ? { height: boxHeight.value } : {}));
  const shownHeight = heights[index];
  // The block grows or shrinks smoothly to the height of the page you switch to, instead of jumping.
  useEffect(() => {
    if (shownHeight == null) return;
    boxHeight.value = boxHeight.value < 0 ? shownHeight : withTiming(shownHeight, { duration: 220 });
  }, [shownHeight, boxHeight]);

  useEffect(() => {
    if (width <= 0 || current.current === index) return;
    current.current = index;
    scroller.current?.scrollTo({ x: index * width, animated: true });
  }, [index, width]);

  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width <= 0) return;
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next === current.current) return;
    current.current = next;
    onIndexChange(next);
  };

  return (
    <Animated.View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={[styles.box, boxStyle]}>
      {width > 0 ? (
        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          bounces={false}
          overScrollMode='never'
          showsHorizontalScrollIndicator={false}
          directionalLockEnabled
          onMomentumScrollEnd={onSettle}
          contentOffset={{ x: index * width, y: 0 }}
        >
          {pages.map((page, i) => (
            // flex-start: each page keeps its own height instead of stretching to the tallest one.
            <View
              key={i}
              style={{ width, alignSelf: 'flex-start' }}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                setHeights((prev) => (prev[i] === h ? prev : Object.assign([...prev], { [i]: h })));
              }}
            >
              {page}
            </View>
          ))}
        </ScrollView>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  box: { overflow: 'hidden' },
});
