import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';

type Props = { description: string | null | undefined; meta: string };

const COLLAPSED_LINES = 1;

/** The description card on the watch screen: views and date on top, the text below, tap to expand or collapse. */
export const DescriptionBox = ({ description, meta }: Props) => {
  const [expanded, setExpanded] = useState(false);
  const text = description?.trim();
  // Cheap stand-in for "does this need more than one line": longer than a line holds, or has a line break.
  const long = Boolean(text && (text.length > 40 || text.includes('\n')));

  return (
    <PressableScale
      disabled={!long}
      onPress={() => setExpanded((v) => !v)}
      accessibilityRole='button'
      accessibilityLabel={expanded ? 'Collapse description' : 'Expand description'}
      scaleTo={0.99}
      style={styles.box}
    >
      <View style={styles.head}>
        <AppText variant='label' color='secondary'>
          Description
        </AppText>
        <AppText variant='caption' color='muted'>
          {meta}
        </AppText>
      </View>

      {text ? (
        <>
          <AppText variant='body' numberOfLines={expanded ? undefined : COLLAPSED_LINES}>
            {text}
          </AppText>
          {long ? (
            <AppText variant='label' color='accent'>
              {expanded ? 'Show less' : 'Show more'}
            </AppText>
          ) : null}
        </>
      ) : (
        <AppText variant='bodySmall' color='muted'>
          The creator hasn't added a description.
        </AppText>
      )}
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.base,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
});
