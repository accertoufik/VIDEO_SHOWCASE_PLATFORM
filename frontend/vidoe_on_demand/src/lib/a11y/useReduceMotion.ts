import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** True when the system asks for less motion. For anything not driven by Reanimated (which has its own flag). */
export const useReduceMotion = () => {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => mounted && setReduce(value))
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduce;
};
