import { useAuth } from '@clerk/clerk-expo';
import { useMutation } from '@tanstack/react-query';
import { RemoteImage as Image } from '@/components/ui/RemoteImage';
import { memo, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { recordWatch } from '@/api/playback';
import { colors } from '@/css';
import { useApi } from '@/lib/auth/useApi';
import type { VideoCardData } from '@/types/video';
import { ShortOverlay } from './shortOverlay';
import { ShortVideo } from './shortVideo';

type Props = {
  video: VideoCardData;
  /** Page height: one short fills one screen. */
  height: number;
  /** This is the short currently centred on screen. */
  active: boolean;
  /** The next short: mounted and paused so its first seconds and metadata are already loaded when it arrives. */
  preload: boolean;
  /** The Shorts tab is focused and the app is in the foreground. */
  screenActive: boolean;
  muted: boolean;
  /** Set (to a changing value) to open the comments as soon as this short is on screen, e.g. from a notification. */
  autoOpenCommentsKey?: string;
};

// One full-screen short: thumbnail until the first frame, the player (mounted only while active, so at most one
// decoder is alive), tap to pause/resume, and the like/comment/follow overlay.
export const ShortItem = memo(
  ({ video, height, active, preload, screenActive, muted, autoOpenCommentsKey }: Props) => {
    const api = useApi();
    const { isSignedIn } = useAuth();
    const [commentsOpen, setCommentsOpen] = useState(false);
    const [firstFrame, setFirstFrame] = useState(false);
    const [userPaused, setUserPaused] = useState(false);
    const watched = useRef(false);

    const watch = useMutation({
      mutationFn: () => recordWatch(api, video.id),
      meta: { silent: true },
    });

    // Swiping away resets the short, so coming back starts playing again.
    useEffect(() => {
      if (!active) {
        setUserPaused(false);
        setCommentsOpen(false);
      }
      if (!active && !preload) setFirstFrame(false);
    }, [active, preload]);

    useEffect(() => {
      if (autoOpenCommentsKey && active) setCommentsOpen(true);
    }, [autoOpenCommentsKey, active]);

    // Only the active short plays; the preloading one stays paused and just buffers. Opening the comments does NOT
    // pause it: people comment while it keeps playing.
    const paused = !active || !screenActive || userPaused;
    const mountPlayer = active || preload;
    // 9:16 (or taller) shorts take the whole screen; any other ratio is shown whole, never stretched.
    const fill = Boolean(
      video.width && video.height && video.width / video.height <= 0.6,
    );

    return (
      <View style={[styles.root, { height }]}>
        {video.thumbnailUrl && !firstFrame ? (
          <Image
            source={{
              uri: video.thumbnailUrl,
              cacheKey: video.thumbnailUrl.split('?')[0],
            }}
            style={StyleSheet.absoluteFill}
            contentFit={fill ? 'cover' : 'contain'}
          />
        ) : null}

        {mountPlayer ? (
          <ShortVideo
            videoId={video.id}
            active={active}
            fill={fill}
            paused={paused}
            muted={muted}
            onFirstFrame={() => setFirstFrame(true)}
            onTap={() => setUserPaused((v) => !v)}
            onPlayStart={() => {
              // Count one view per short per time it is on screen, signed-in viewers only (the API needs an account).
              if (isSignedIn && !watched.current) {
                watched.current = true;
                watch.mutate();
              }
            }}
          />
        ) : null}

        {/* Resume button while paused. Taps anywhere on the video toggle it, so this is just a visual cue. */}
        {active && userPaused ? (
          <View style={styles.resume} pointerEvents='none'>
            <View style={styles.resumeDisc}>
              <Ionicons name='play' size={40} color={colors.text.primary} />
            </View>
          </View>
        ) : null}

        <ShortOverlay
          video={video}
          commentsOpen={commentsOpen}
          onCommentsOpenChange={setCommentsOpen}
        />
      </View>
    );
  },
);
ShortItem.displayName = 'ShortItem';

const styles = StyleSheet.create({
  root: { width: '100%', backgroundColor: colors.background.player },
  resume: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resumeDisc: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.overlay.scrimStrong,
  },
});
