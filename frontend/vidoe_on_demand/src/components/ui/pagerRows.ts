import { createContext, useContext, useMemo } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';

/** Set by a SwipePager: 1 while a finger is down on a sideways-scrolling row inside one of its pages. */
export const PagerRowTouchContext = createContext<SharedValue<number> | null>(null);

/**
 * For a horizontal list inside a pager page: wrap the list in <GestureDetector gesture={...}>. While a finger is on the
 * row, the page swipe stays out of the way, so the row scrolls on its own. (The gesture never activates, so it doesn't
 * interfere with the list's own scrolling.)
 */
export const usePagerRowGesture = () => {
  const touching = useContext(PagerRowTouchContext);
  return useMemo(
    () =>
      Gesture.Manual()
        .onTouchesDown(() => {
          if (touching) touching.value = 1;
        })
        .onTouchesUp(() => {
          if (touching) touching.value = 0;
        })
        .onTouchesCancelled(() => {
          if (touching) touching.value = 0;
        }),
    [touching],
  );
};
