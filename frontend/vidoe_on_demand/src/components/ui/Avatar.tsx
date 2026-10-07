import { RemoteImage as Image } from '@/components/ui/RemoteImage';
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, layout } from '@/css';
import { AppText } from './Text';

type Props = {
  /** A SIGNED url from the API (never build one from blobPath). */
  uri?: string | null;
  name?: string | null;
  size?: keyof typeof layout.avatar;
};

const initialsOf = (name?: string | null) => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (
    parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')
  ).toUpperCase();
};

export const Avatar = ({ uri, name, size = 'md' }: Props) => {
  const [failed, setFailed] = useState<string | null>(null);
  const dimension = layout.avatar[size];
  const box = {
    width: dimension,
    height: dimension,
    borderRadius: dimension / 2,
  };

  return (
    <View
      style={[styles.box, box]}
      accessible
      accessibilityRole='image'
      accessibilityLabel={name ? `${name}'s avatar` : 'Avatar'}
    >
      {uri && failed !== uri ? (
        <Image
          // Cache by path only: the signed query string rotates, the picture doesn't.
          source={{ uri, cacheKey: uri.split('?')[0] }}
          cachePolicy='memory-disk'
          style={box}
          contentFit='cover'
          transition={150}
          onError={() => setFailed(uri)} // fall back to initials instead of an empty circle
        />
      ) : (
        <AppText
          variant={size === 'xs' || size === 'sm' ? 'caption' : 'label'}
          color='accent'
        >
          {initialsOf(name)}
        </AppText>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.accent.primarySoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.borderStrong,
  },
});