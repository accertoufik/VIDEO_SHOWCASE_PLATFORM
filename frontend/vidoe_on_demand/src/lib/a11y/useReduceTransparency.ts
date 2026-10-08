import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** iOS "Reduce Transparency". Always false on Android, which has no such setting (glass is already solid there). */
export const useReduceTransparency = () => {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((value) => mounted && setReduce(value))
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduce;
};
