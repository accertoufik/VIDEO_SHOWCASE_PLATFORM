import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout, motion, spacing } from '@/css';
import { announce } from '@/lib/a11y/announce';
import { errorBus } from '@/lib/errors/errorBus';
import { toast, type ToastEvent } from '@/lib/toast';
import { GlassSurface } from './GlassSurface';
import { AppText } from './Text';

const tone = {
  info: { icon: 'information-circle', color: colors.accent.secondary },
  success: { icon: 'checkmark-circle', color: colors.status.success },
  error: { icon: 'alert-circle', color: colors.status.error },
} as const;

const VISIBLE_MS = 3500;
const VISIBLE_ERROR_MS = 5500; // errors stay long enough to be read (or heard) in full
const DEDUPE_MS = 1500;

/**
 * Mount ONCE in the root layout. Shows one toast at a time and listens to:
 *  - toast.*       (explicit messages from the app)
 *  - errorBus      (failed mutations raised by the query layer in Phase 1)
 */
export const ToastHost = () => {
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<(ToastEvent & { id: number }) | null>(
    null,
  );
  const last = useRef({ message: '', at: 0 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    const show = (event: ToastEvent) => {
      const now = Date.now();
      // Several failing requests often report the same message at once; show it a single time.
      if (
        event.message === last.current.message &&
        now - last.current.at < DEDUPE_MS
      )
        return;
      last.current = { message: event.message, at: now };
      setCurrent({ ...event, id: now });
      if (timer.current) clearTimeout(timer.current);
      announce(event.message);
      timer.current = setTimeout(() => setCurrent(null), event.tone === 'error' ? VISIBLE_ERROR_MS : VISIBLE_MS);
    };

    const offToast = toast.subscribe(show);
    const offErrors = errorBus.follow((event) =>
      show({ message: event.message, tone: 'error' }),
    );
    return () => {
      offToast();
      offErrors();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!current) return null;
  const t = tone[current.tone];

  return (
    <Animated.View
      key={current.id}
      entering={FadeInUp.duration(motion.normal)}
      exiting={FadeOutUp.duration(motion.fast)}
      pointerEvents='box-none'
      style={[styles.wrap, { top: insets.top + spacing.sm }]}
    >
      <Pressable
        onPress={() => {
          current.onPress?.();
          setCurrent(null);
        }}
        accessibilityRole='alert'
        accessibilityLiveRegion='polite'
        accessibilityLabel={current.message}
        accessibilityHint={current.onPress ? 'Tap to open' : 'Tap to dismiss'}
      >
        <GlassSurface variant='strong' radius='lg' style={styles.surface}>
          <Ionicons name={t.icon} size={20} color={t.color} />
          <AppText variant='bodySmall' style={styles.text} numberOfLines={3}>
            {current.message}
          </AppText>
        </GlassSurface>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    alignItems: 'center',
    zIndex: 1000,
  },
  surface: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    maxWidth: layout.maxContentWidth,
  },
  text: { flexShrink: 1 },
});
