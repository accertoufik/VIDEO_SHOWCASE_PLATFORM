import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo } from 'react';
import type { ComponentType } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/Text';
import { colors } from '@/css';
import { streamUrl } from '@/lib/streamUrl';

type Props = {
  videoId: string;
  /** True only for the short centred on screen. The next short is mounted too, paused, so it is already buffered. */
  active: boolean;
  /** A true 9:16 video: fill the whole screen. Any other shape keeps its own aspect ratio (never stretched). */
  fill: boolean;
  paused: boolean;
  muted: boolean;
  onFirstFrame: () => void;
  onPlayStart: () => void;
  /** Tap on the video (pause / resume). */
  onTap: () => void;
};

// How much to buffer ahead: the short waiting in the wings only needs its first few seconds (plus the manifest and
// metadata, which load as soon as the player has its source); the one playing buffers more so it never stalls.
const PRELOAD_BUFFER_S = 5;
const PLAYING_BUFFER_S = 20;

// expo-video's typings lag behind its props (allowsFullscreen etc.), so view it through a loose component type.
const LooseVideoView = VideoView as unknown as ComponentType<Record<string, unknown>>;

// Looping player (9:16 fills the screen, other shapes keep their ratio). At most two exist at once: the short
// on screen and the next one, preloading.
export const ShortVideo = ({
  videoId,
  active,
  fill,
  paused,
  muted,
  onFirstFrame,
  onPlayStart,
  onTap,
}: Props) => {
  // Shorts are public, so no credentials are needed. "auto" lets HLS pick the rendition for the connection.
  const source = useMemo(() => ({ uri: streamUrl(videoId) }), [videoId]);
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.bufferOptions = { preferredForwardBufferDuration: PRELOAD_BUFFER_S };
  });

  // Silent until it is the one on screen; the sound setting applies to the active short only.
  useEffect(() => {
    player.muted = active ? muted : true;
  }, [player, muted, active]);

  useEffect(() => {
    try {
      player.bufferOptions = {
        preferredForwardBufferDuration: active ? PLAYING_BUFFER_S : PRELOAD_BUFFER_S,
      };
    } catch {
      // buffer tuning is a nicety
    }
  }, [player, active]);

  // paused === true for the preloading short too: it buffers but never plays.
  useEffect(() => {
    if (paused) player.pause();
    else player.play();
  }, [player, paused]);

  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    if (isPlaying && active) onPlayStart();
  });

  const { status } = useEvent(player, 'statusChange', {
    status: player.status,
  });
  return (
    <>
      <LooseVideoView
        player={player}
        style={StyleSheet.absoluteFill}
        // 9:16 fills the screen; anything else is letterboxed so it is never cropped or stretched.
        contentFit={fill ? 'cover' : 'contain'}
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
        onFirstFrameRender={onFirstFrame}
      />

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onTap}
        accessibilityLabel={paused ? 'Play short' : 'Pause short'}
      />

      {active && status === 'loading' ? (
        <View style={styles.center} pointerEvents='none'>
          <ActivityIndicator color={colors.text.primary} />
        </View>
      ) : null}
      {active && status === 'error' ? (
        <View style={styles.center} pointerEvents='none'>
          <AppText variant='bodySmall' color='secondary'>
            Couldn't play this short
          </AppText>
        </View>
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
