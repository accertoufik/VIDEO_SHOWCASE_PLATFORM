import { Ionicons } from '@expo/vector-icons';
import {
  Children,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout, radii, spacing } from '@/css';
import { PressableScale } from './PressableScale';
import { AppText } from './Text';

type IconName = keyof typeof Ionicons.glyphMap;

type Props = {
  icon?: IconName;
  label: string;
  description?: string;
  /** Muted text on the right, e.g. "On" or a count. */
  value?: string;
  /** Custom right-hand control (a Switch, a button). Replaces the chevron. */
  right?: ReactNode;
  onPress?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** Set by ListGroup: the row sits inside a shared card, so it draws no card of its own. */
  plain?: boolean;
  /** Tint the icon box with the accent colour (for a call to action). */
  highlight?: boolean;
};

/** One tappable settings/menu line: icon in a tinted square, label + description, then a value, switch or chevron. */
export const ListRow = ({
  icon,
  label,
  description,
  value,
  right,
  onPress,
  destructive,
  disabled,
  plain,
  highlight,
}: Props) => {
  const body = (
    <>
      {icon ? (
        <View style={[styles.iconBox, highlight && styles.iconBoxHighlight, destructive && styles.iconBoxDanger]}>
          <Ionicons
            name={icon}
            size={19}
            color={destructive ? colors.status.error : highlight ? colors.accent.text : colors.icon.primary}
          />
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant='title' color={destructive ? 'error' : 'primary'}>
          {label}
        </AppText>
        {description ? (
          <AppText variant='bodySmall' color='muted' style={styles.description}>
            {description}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant='bodySmall' color='secondary'>
          {value}
        </AppText>
      ) : null}
      {right ?? (onPress ? <Ionicons name='chevron-forward' size={18} color={colors.text.muted} /> : null)}
    </>
  );

  const style = [styles.row, plain ? null : styles.card];
  if (!onPress) return <View style={style}>{body}</View>;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      accessibilityRole='button'
      accessibilityLabel={`${label}${value ? `, ${value}` : ''}`}
      scaleTo={0.985}
      style={style}
    >
      {body}
    </PressableScale>
  );
};

type GroupProps = { title?: string; children: ReactNode };

/** A titled card holding several rows, with hairline dividers between them (inset-grouped list). */
export const ListGroup = ({ title, children }: GroupProps) => {
  const rows = Children.toArray(children).filter(isValidElement) as ReactElement<Props>[];
  return (
    <View style={styles.group}>
      {title ? (
        <AppText variant='label' color='muted' style={styles.title}>
          {title.toUpperCase()}
        </AppText>
      ) : null}
      <View style={styles.card}>
        {rows.map((row, i) => (
          <View key={row.key ?? i}>
            {i > 0 ? <View style={styles.divider} /> : null}
            {row.type === ListRow ? cloneElement(row, { plain: true }) : row}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  title: { paddingHorizontal: spacing.xs, letterSpacing: 0.6 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: layout.minTouchTarget + spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  card: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.base,
    overflow: 'hidden',
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: spacing.lg + 36 + spacing.md, backgroundColor: colors.surface.border },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface.soft,
  },
  iconBoxHighlight: { backgroundColor: colors.accent.primarySoft },
  iconBoxDanger: { backgroundColor: colors.status.errorSoft },
  // Label and description sit close together: no gap, and a tighter line height on the description.
  text: { flex: 1, gap: 0 },
  description: { lineHeight: 16, marginTop: -1 },
});
