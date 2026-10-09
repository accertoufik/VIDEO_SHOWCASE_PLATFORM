import { Image, type ImageProps, type ImageSource } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { colors, motion } from '@/css';
import { useReduceMotion } from '@/lib/a11y/useReduceMotion';

/**
 * Signed URLs change on every API response (a new ?sig=...), which would defeat the image cache and
 * re-download every thumbnail on each refetch. Key the cache by the path alone instead.
 * (If a blob is ever overwritten at the same path, bump its name rather than reusing it.)
 */
const stableKey = (uri: string) => uri.split('?')[0];

const MAX_RETRIES = 3;

const withRetryMarker = (uri: string, attempt: number) =>
  attempt > 0 ? `${uri}${uri.includes('?') ? '&' : '?'}_r=${attempt}` : uri;

/**
 * Network pictures that don't go blank:
 *  - A refetch hands out the same picture with a NEW signed link. The view used to clear itself and reload on every
 *    such change, and one failed reload left it empty for good (a pull-to-refresh returns the same link text, so
 *    the view saw "nothing changed" and never tried again). Now the link already on screen is kept for as long as
 *    it works, and only a different PICTURE (a different path) swaps it.
 *  - If a load fails, the view switches to the newest link and retries, a few times with a short pause. The retry
 *    marker makes each attempt a distinct request; storage ignores it, and the cache key (the path) is unchanged.
 */
export const RemoteImage = ({
  source,
  transition,
  cachePolicy = 'memory-disk',
  style,
  onError,
  onLoad,
  ...rest
}: ImageProps) => {
  const reduceMotion = useReduceMotion();
  const fade = transition ?? (reduceMotion ? 0 : motion.fast);

  const object =
    source && typeof source === 'object' && !Array.isArray(source) && 'uri' in source
      ? (source as ImageSource)
      : null;
  const wanted = object?.uri ?? null;
  const wantedKey = wanted ? stableKey(wanted) : null;

  // The link actually loaded, and how many retries it has had.
  const [shown, setShown] = useState<string | null>(wanted);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(wanted);
  latest.current = wanted;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Runs only when the PICTURE changes (its path), never when just the signed link rotates.
  useEffect(() => {
    setShown(wanted);
    setAttempt(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedKey]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const handleError = useCallback<NonNullable<ImageProps['onError']>>(
    (event) => {
      onError?.(event);
      if (attempt >= MAX_RETRIES || !latest.current) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        // The newest link (the one on screen may have expired), marked so it is a fresh request.
        setShown(latest.current);
        setAttempt((a) => a + 1);
      }, 700 * (attempt + 1));
    },
    [attempt, onError],
  );

  const handleLoad = useCallback<NonNullable<ImageProps['onLoad']>>(
    (event) => {
      if (attempt !== 0) setAttempt(0);
      onLoad?.(event);
    },
    [attempt, onLoad],
  );

  const resolved = useMemo(() => {
    if (object && shown) {
      const withKey: ImageSource = { ...object, uri: withRetryMarker(shown, attempt) };
      if (!withKey.cacheKey) withKey.cacheKey = stableKey(shown);
      return withKey;
    }
    return source;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, shown, attempt]);

  return (
    <Image
      source={resolved}
      transition={fade}
      cachePolicy={cachePolicy}
      style={[{ backgroundColor: colors.surface.glassMedium }, style]}
      onError={handleError}
      onLoad={handleLoad}
      {...rest}
    />
  );
};
