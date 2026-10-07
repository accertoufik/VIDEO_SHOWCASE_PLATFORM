import { useEffect, useState } from 'react';

/** Returns `value` only after it has stopped changing for `delayMs`. Used so search doesn't fire per keystroke. */
export const useDebouncedValue = <T>(value: T, delayMs = 350): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
};
