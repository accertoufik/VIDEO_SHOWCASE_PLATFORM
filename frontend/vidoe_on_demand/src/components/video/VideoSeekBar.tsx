import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/Text';
import { colors, spacing } from '@/css';
import { formatDuration } from '@/utils/format';

type Props = {
  currentTime: number; // seconds
  duration: number; // seconds
  onSeek: (seconds: number) => void;
  onScrub?: () => void; // called while dragging, so the controls don't auto-hide
  /** Elapsed / total labels beside the bar. Off for Shorts. */
  showTimes?: boolean;
};

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Tap or drag to seek. Shows elapsed / total time next to the bar. */
export const VideoSeekBar = ({
  currentTime,
  duration,
  onSeek,
  onScrub,
  showTimes = true,
}: Props) => {
  const [width, setWidth] = useState(0);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const start = useRef(0);
  const live = useRef({ width, duration, onSeek, onScrub });
  live.current = { width, duration, onSeek, onScrub };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          start.current = event.nativeEvent.locationX;
          const { width: w } = live.current;
          if (w > 0) setDragRatio(clamp01(start.current / w));
          live.current.onScrub?.();
        },
        onPanResponderMove: (_event, gesture) => {
          const { width: w } = live.current;
          if (w > 0) setDragRatio(clamp01((start.current + gesture.dx) / w));
          live.current.onScrub?.();
        },
        onPanResponderRelease: (_event, gesture) => {
          const { width: w, duration: d, onSeek: seek } = live.current;
          if (w > 0 && d > 0) seek(clamp01((start.current + gesture.dx) / w) * d);
          setDragRatio(null);
        },
        onPanResponderTerminate: () => setDragRatio(null),
      }),
    [],
  );

  const ratio =
    dragRatio ?? (duration > 0 ? clamp01(currentTime / duration) : 0);
  const shown = dragRatio != null ? dragRatio * duration : currentTime;

  return (
    <View style={styles.row}>
      {showTimes ? (
        <AppText variant='caption'>{formatDuration(shown * 1000)}</AppText>
      ) : null}
      <View
        style={styles.touch}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        {...pan.panHandlers}
        accessibilityRole='adjustable'
        accessibilityLabel='Seek bar'
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
        </View>
        <View style={[styles.thumb, { left: `${ratio * 100}%` }]} />
      </View>
      {showTimes ? (
        <AppText variant='caption'>{formatDuration(duration * 1000)}</AppText>
      ) : null}
    </View>
  );
};

/** Thin non-interactive line shown while the controls are hidden. */
export const VideoMiniProgress = ({ currentTime, duration }: Pick<Props, 'currentTime' | 'duration'>) => (
  <View style={styles.mini} pointerEvents='none'>
    <View
      style={[
        styles.fill,
        { width: `${duration > 0 ? clamp01(currentTime / duration) * 100 : 0}%` },
      ]}
    />
  </View>
);

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  touch: { flex: 1, height: 32, justifyContent: 'center' },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.player.trackBase,
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: colors.accent.primary },
  thumb: {
    position: 'absolute',
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accent.primary,
  },
  mini: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: colors.player.trackMini,
  },
});
