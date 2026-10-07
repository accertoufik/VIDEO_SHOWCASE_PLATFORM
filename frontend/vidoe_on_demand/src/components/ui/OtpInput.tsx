import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, layout, radii, spacing } from '@/css';
import { AppText } from './Text';

type Props = {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  onComplete?: (value: string) => void;
  autoFocus?: boolean;
};

/** One box per digit. A single hidden input does the typing, so paste, SMS autofill and backspace all work. */
export const OtpInput = ({ value, onChange, length = 6, onComplete, autoFocus = true }: Props) => {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const current = Math.min(value.length, length - 1);

  const change = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
  };

  return (
    <Pressable onPress={() => input.current?.focus()} accessibilityLabel='Verification code' style={styles.row}>
      {Array.from({ length }, (_, i) => (
        <View
          key={i}
          style={[styles.box, focused && i === current && styles.active, value[i] ? styles.filled : null]}
        >
          <AppText variant='h2'>{value[i] ?? ''}</AppText>
        </View>
      ))}
      <TextInput
        ref={input}
        value={value}
        onChangeText={change}
        keyboardType='number-pad'
        autoComplete='one-time-code'
        textContentType='oneTimeCode'
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hidden}
      />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  // Fixed-size boxes in a centred group: on a wide screen they stay together instead of spreading to the edges.
  row: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm },
  box: {
    width: 48,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: layout.focusRingWidth,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.input,
  },
  active: { borderColor: colors.focus },
  filled: { borderColor: colors.surface.borderStrong },
  hidden: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0 },
});
