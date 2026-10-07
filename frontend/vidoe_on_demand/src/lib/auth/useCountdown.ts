import { useCallback, useEffect, useState } from 'react';

/** Counts down from `seconds` to 0 once per second. `restart()` begins again (e.g. after "Resend code"). */
export const useCountdown = (seconds: number) => {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  const restart = useCallback(() => setLeft(seconds), [seconds]);
  const label = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  return { left, label, restart };
};
