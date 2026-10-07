import { useEffect, useState } from 'react';

/** From the phone's own clock, so it follows the viewer's local time and region (and daylight-saving changes). */
export const greetingFor = (date: Date) => {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  if (hour >= 17 && hour < 21) return 'Good evening';
  return 'Good night'; // 9 pm to 5 am
};

/** The current greeting; re-checked every minute so it changes while the screen stays open. */
export const useGreeting = () => {
  const [greeting, setGreeting] = useState(() => greetingFor(new Date()));
  useEffect(() => {
    const timer = setInterval(
      () => setGreeting(greetingFor(new Date())),
      60_000,
    );
    return () => clearInterval(timer);
  }, []);
  return greeting;
};
