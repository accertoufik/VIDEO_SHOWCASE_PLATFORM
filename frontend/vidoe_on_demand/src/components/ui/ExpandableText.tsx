import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from './PressableScale';
import { AppText, type TextColor } from './Text';
import type { TypographyVariant } from '@/css';

type Props = {
  text: string;
  lines?: number;
  variant?: TypographyVariant;
  color?: TextColor;
};

/** Text clamped to a few lines with "See more" / "See less". Short text shows in full, with no button. */
export const ExpandableText = ({ text, lines = 3, variant = 'body', color = 'secondary' }: Props) => {
  const [expanded, setExpanded] = useState(false);
  // Cheap stand-in for "does this need more than `lines` lines": long, or several line breaks.
  const long = text.length > lines * 45 || text.split('\n').length > lines;

  return (
    <View style={styles.root}>
      <AppText variant={variant} color={color} numberOfLines={expanded ? undefined : lines}>
        {text}
      </AppText>
      {long ? (
        <PressableScale
          onPress={() => setExpanded((v) => !v)}
          hitSlop={8}
          accessibilityRole='button'
          accessibilityLabel={expanded ? 'See less' : 'See more'}
          style={styles.toggle}
        >
          <AppText variant='label' color='accent'>
            {expanded ? 'See less' : 'See more'}
          </AppText>
        </PressableScale>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: 4 },
  toggle: { alignSelf: 'flex-start' },
});
