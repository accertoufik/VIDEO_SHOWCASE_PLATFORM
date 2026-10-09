import { useEffect, useRef, useState } from 'react';
import type { VideoPlayer } from 'expo-video';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '@/css';
import { type Cue, cuesAt } from '@/lib/subtitles/vtt';

type Props = {
  player: VideoPlayer;
  cues: Cue[];
  /** Larger in full screen. */
  fontSize: number;
  /** Lift the captions above the controls while they're showing. */
  bottomOffset: number;
  /** Seconds to hold the captions back (+) or bring them forward (-), for files whose captions are timed off. */
  delaySeconds?: number;
};

// Crunchyroll-style captions: bold white text with a black outline, no background box, centred near the bottom.
// React Native has no text-stroke, so the outline is the same text drawn in black at a few offsets BEHIND the white.
// Each black copy sits in its own absolute-fill box (shifted with a transform) so it wraps exactly like the white
// text; the white text is last in the tree, so it is drawn on top and also decides the size of the whole line.
const OUTLINE = [
  [-1.2, 0],
  [1.2, 0],
  [0, -1.2],
  [0, 1.2],
  [-0.9, -0.9],
  [0.9, -0.9],
  [-0.9, 0.9],
  [0.9, 0.9],
] as const;

const Line = ({ text, italic, fontSize }: { text: string; italic: boolean; fontSize: number }) => {
  const base = {
    fontSize,
    lineHeight: Math.round(fontSize * 1.25),
    fontFamily: fonts.bold,
    fontStyle: italic ? ('italic' as const) : ('normal' as const),
    textAlign: 'center' as const,
  };
  return (
    <View>
      {OUTLINE.map(([dx, dy]) => (
        <View
          key={`${dx},${dy}`}
          style={[StyleSheet.absoluteFill, { transform: [{ translateX: dx }, { translateY: dy }] }]}
          pointerEvents='none'
          accessible={false}
          importantForAccessibility='no-hide-descendants'
        >
          <Text style={[base, styles.outline]}>{text}</Text>
        </View>
      ))}
      <Text style={[base, styles.text]}>{text}</Text>
    </View>
  );
};

const sameCues = (a: Cue[], b: Cue[]) => a.length === b.length && a.every((cue, i) => cue === b[i]);

/**
 * Draws the cues for the current playback time. It reads the player's clock directly every ~40 ms instead of
 * waiting for the player's "time update" event (which fires only 4 times a second and then goes through the
 * bridge and a React render), because captions driven by that event trailed the picture by up to a second or
 * more. State only changes when a caption actually appears or disappears, so this doesn't re-render all the time.
 */
export const SubtitleOverlay = ({ player, cues, fontSize, bottomOffset, delaySeconds = 0 }: Props) => {
  const [active, setActive] = useState<Cue[]>([]);
  const activeRef = useRef<Cue[]>([]);

  useEffect(() => {
    const tick = () => {
      let now = 0;
      try {
        now = player.currentTime;
      } catch {
        return; // the player is being released
      }
      const next = cuesAt(cues, now - delaySeconds);
      if (!sameCues(next, activeRef.current)) {
        activeRef.current = next;
        setActive(next);
      }
    };
    tick();
    const id = setInterval(tick, 40);
    return () => clearInterval(id);
  }, [player, cues, delaySeconds]);

  if (cues.length === 0 || active.length === 0) return null;

  return (
    <View style={[styles.wrap, { bottom: bottomOffset }]} pointerEvents='none'>
      {active.map((cue, i) => (
        <Line key={`${cue.start}-${i}`} text={cue.text} italic={cue.italic} fontSize={fontSize} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 24,
    right: 24,
    alignItems: 'center',
    gap: 2,
  },
  outline: { color: colors.player.captionOutline },
  text: { color: colors.player.captionText },
});
