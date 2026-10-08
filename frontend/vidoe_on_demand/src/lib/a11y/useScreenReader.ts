import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** True while TalkBack / VoiceOver is running. */
export const useScreenReader = () => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((value) => mounted && setOn(value))
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setOn);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return on;
};
