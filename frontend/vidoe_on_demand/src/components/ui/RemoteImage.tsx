import { Image, type ImageProps, type ImageSource } from 'expo-image';
import { useMemo } from 'react';
import { colors, motion } from '@/css';

/**
 * Signed URLs change on every API response (a new ?sig=...), which would defeat the image cache and
 * re-download every thumbnail on each refetch. Key the cache by the path alone instead.
 * (If a blob is ever overwritten at the same path, bump its name rather than reusing it.)
 */
const stableKey = (uri: string) => uri.split('?')[0];

export const RemoteImage = ({
  source,
  transition = motion.fast,
  cachePolicy = 'memory-disk',
  style,
  ...rest
}: ImageProps) => {
  const resolved = useMemo(() => {
    if (
      source &&
      typeof source === 'object' &&
      !Array.isArray(source) &&
      'uri' in source
    ) {
      const src = source as ImageSource;
      if (src.uri && !src.cacheKey)
        return { ...src, cacheKey: stableKey(src.uri) };
    }
    return source;
  }, [source]);

  return (
    <Image
      source={resolved}
      transition={transition}
      cachePolicy={cachePolicy}
      style={[{ backgroundColor: colors.surface.glassMedium }, style]}
      {...rest}
    />
  );
};
