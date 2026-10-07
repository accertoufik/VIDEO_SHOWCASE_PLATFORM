import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, layout, spacing, typography } from '@/css';
import { GlassSurface } from './GlassSurface';
import { AppText } from './Text';
import { PressableScale } from './PressableScale';

type Props = {
  placeholder?: string;
  /** Tap-to-open mode (Home): shows the bar as a button and calls onPress. */
  onPress?: () => void;
  /** Editable mode (Search screen). */
  value?: string;
  onChangeText?: (text: string) => void;
  onSubmit?: (text: string) => void;
  autoFocus?: boolean;
};

export const SearchBar = ({
  placeholder = 'Search videos, creators, topics',
  onPress,
  value = '',
  onChangeText,
  onSubmit,
  autoFocus,
}: Props) => {
  const [focused, setFocused] = useState(false);
  const content = onPress ? (
    <View style={styles.row}>
      <Ionicons name='search' size={20} color={colors.text.muted} />
      <AppText
        variant='body'
        color='muted'
        numberOfLines={1}
        style={styles.flex}
      >
        {placeholder}
      </AppText>
    </View>
  ) : (
    <View style={styles.row}>
      <Ionicons name='search' size={20} color={colors.text.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={() => onSubmit?.(value.trim())}
        placeholder={placeholder}
        placeholderTextColor={colors.text.muted}
        selectionColor={colors.accent.primary}
        returnKeyType='search'
        autoCorrect={false}
        autoCapitalize='none'
        autoFocus={autoFocus}
        accessibilityLabel='Search'
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[typography.body, styles.input]}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText?.('')}
          accessibilityRole='button'
          accessibilityLabel='Clear search'
          hitSlop={10}
        >
          <Ionicons name='close-circle' size={18} color={colors.text.muted} />
        </Pressable>
      ) : null}
    </View>
  );

  const surface = (
    <GlassSurface variant='subtle' radius='pill' style={styles.surface}>
      {content}
      {focused && !onPress ? <View pointerEvents='none' style={styles.ring} /> : null}
    </GlassSurface>
  );

  return onPress ? (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={placeholder}
      scaleTo={0.985}
    >
      {surface}
    </PressableScale>
  ) : (
    surface
  );
};

const styles = StyleSheet.create({
  surface: { height: layout.minTouchTarget + 4, justifyContent: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  flex: { flex: 1 },
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: layout.focusRingWidth,
    borderColor: colors.focus,
  },
  input: { flex: 1, color: colors.text.primary, paddingVertical: 0 },
});
