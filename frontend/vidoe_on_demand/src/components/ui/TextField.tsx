import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { colors, layout, radii, spacing, typography } from '@/css';

// lineHeight inside a TextInput makes the text jump while typing (worst with secureTextEntry), so drop it.
const { lineHeight: _lineHeight, ...inputTypography } = typography.body;
import { AppText } from './Text';

type Props = TextInputProps & {
  label: string;
  /** Leading icon inside the box (mail, lock ...). */
  icon?: ComponentProps<typeof Ionicons>['name'];
  /** The label stays for screen readers but isn't drawn (the placeholder carries the meaning). */
  hideLabel?: boolean;
  error?: string | null;
  /** A message under the box that isn't an error, e.g. "Username is available". */
  helper?: { text: string; tone: 'success' | 'muted' } | null;
};

// Password masking, done here so the timing is ours. The phone's own masking hides the last typed character after a
// fixed, very short delay that can't be changed (and visibly re-renders the field, which looks jittery). Instead the
// real input is invisible and a dot-version is drawn over it: the character you just typed stays readable for a
// moment, then turns into a dot. A monospace font keeps every glyph the same width, so the caret lines up.
const REVEAL_MS = 1200;
const ringBase = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  borderRadius: radii.md,
  borderWidth: layout.focusRingWidth,
  borderColor: colors.focus,
};

// Blinking caret drawn after the dots (the real input is fully hidden, so its own caret isn't visible).
const Caret = () => {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.caret, { opacity }]} />;
};
const MASK = '\u2022';
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export const TextField = ({
  label,
  icon,
  hideLabel = false,
  error,
  helper,
  secureTextEntry,
  style,
  ...rest
}: Props) => {
  const [hidden, setHidden] = useState(Boolean(secureTextEntry));
  const [focused, setFocused] = useState(false);

  const masking = Boolean(secureTextEntry) && hidden;
  const value = typeof rest.value === 'string' ? rest.value : '';
  const [reveal, setReveal] = useState(false);
  const previousLength = useRef(0);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const typedOne = value.length === previousLength.current + 1;
    previousLength.current = value.length;
    if (revealTimer.current) clearTimeout(revealTimer.current);
    if (masking && typedOne) {
      setReveal(true);
      revealTimer.current = setTimeout(() => setReveal(false), REVEAL_MS);
    } else {
      setReveal(false);
    }
    return () => {
      if (revealTimer.current) clearTimeout(revealTimer.current);
    };
  }, [value, masking]);
  const masked = value
    ? MASK.repeat(value.length - 1) +
      (reveal ? value.slice(-1) : MASK)
    : '';

  return (
    <View style={styles.wrap}>
      {hideLabel ? null : (
        <AppText variant='label' color='secondary'>
          {label}
        </AppText>
      )}
      <View
        style={[
          styles.field,
          Boolean(error) && styles.errored,
        ]}
      >
        {focused ? <View pointerEvents='none' style={styles.ring} /> : null}
        {icon ? <Ionicons name={icon} size={18} color={colors.icon.muted} /> : null}
        <View style={styles.inputBox}>
          <TextInput
            {...rest}
            accessibilityLabel={label}
            // Never the phone's own masking (see above). The eye button toggles between dots and plain text.
            secureTextEntry={false}
            placeholderTextColor={colors.text.muted}
            selectionColor={colors.accent.primary}
            cursorColor={colors.accent.primary}
            onFocus={(event) => {
              setFocused(true);
              rest.onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              rest.onBlur?.(event);
            }}
            // Password fields: no autocorrect/suggestions (they re-render the text and cause flicker).
            {...(secureTextEntry
              ? {
                  autoCorrect: false,
                  spellCheck: false,
                  autoCapitalize: 'none' as const,
                  contextMenuHidden: masking,
                  ...(Platform.OS === 'android' ? { keyboardType: 'visible-password' as const } : null),
                }
              : null)}
            style={[
              styles.text,
              styles.input,
              style,
              masking ? styles.invisible : null,
            ]}
          />
          {masking ? (
            <View pointerEvents='none' style={styles.overlayRow} importantForAccessibility='no-hide-descendants'>
              {masked ? (
                <Text numberOfLines={1} accessible={false} style={[styles.text, styles.input, styles.overlayText]}>
                  {masked}
                </Text>
              ) : (
                // The real input is fully hidden (opacity 0), which hides its placeholder too: draw it here.
                <Text numberOfLines={1} accessible={false} style={[styles.text, styles.input, styles.placeholder]}>
                  {rest.placeholder}
                </Text>
              )}
              {focused ? (
                // Empty field: the cursor sits at the start, in front of the placeholder.
                masked ? <Caret /> : <View style={styles.caretStart}><Caret /></View>
              ) : null}
            </View>
          ) : null}
        </View>
        {secureTextEntry ? (
          <Pressable
            onPress={() => setHidden((v) => !v)}
            hitSlop={10}
            accessibilityRole='button'
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            <Ionicons
              name={hidden ? 'eye-outline' : 'eye-off-outline'}
              size={20}
              color={colors.text.muted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion='polite'>
          <Ionicons name='alert-circle' size={16} color={colors.status.error} />
          <AppText variant='bodySmall' color='error' style={styles.errorText}>
            {error}
          </AppText>
        </View>
      ) : helper ? (
        <AppText
          variant='bodySmall'
          color={helper.tone}
          accessibilityLiveRegion='polite'
        >
          {helper.text}
        </AppText>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  text: inputTypography,
  wrap: { gap: spacing.xs },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  errorText: { flex: 1 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: layout.minTouchTarget + 8,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.input,
  },
  // A thick white ring drawn on top, so the box doesn't change size when it gains focus.
  ring: {
    ...ringBase,
  },
  errored: { borderColor: colors.status.error },
  inputBox: { flex: 1, justifyContent: 'center' },
  input: {
    color: colors.text.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: 0,
    includeFontPadding: false,
  },
  // The real (invisible) input and its dotted overlay must use identical metrics so the caret lines up.
  // opacity 0 (not just a transparent colour) so the typed text can never show through the dots.
  invisible: { opacity: 0, fontFamily: MONO },
  overlayRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  overlayText: { fontFamily: MONO, paddingVertical: spacing.md, flexShrink: 1 },
  placeholder: { color: colors.text.muted, paddingVertical: spacing.md, flexShrink: 1 },
  caretStart: { position: 'absolute', left: 0 },
  caret: { width: 2, height: 20, marginLeft: 1, backgroundColor: colors.accent.primary },
});
