import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, layout, radii, spacing } from '@/css';
import { ScreenHeader } from './ScreenHeader';
import { SkeletonBlock } from './SkeletonBlock';

type RowVariant = 'video' | 'avatar' | 'text';

const Row = ({ variant }: { variant: RowVariant }) => (
  <View style={styles.row}>
    {variant === 'video' ? (
      <SkeletonBlock width={128} height={72} radius={radii.md} />
    ) : null}
    {variant === 'avatar' ? (
      <SkeletonBlock width={40} height={40} radius={radii.pill} />
    ) : null}
    <View style={styles.lines}>
      <SkeletonBlock height={14} width='85%' />
      <SkeletonBlock height={12} width='60%' />
      {variant !== 'text' ? <SkeletonBlock height={10} width='35%' /> : null}
    </View>
  </View>
);

export const ListSkeleton = ({
  rows = 6,
  variant = 'video',
}: {
  rows?: number;
  variant?: RowVariant;
}) => (
  <View style={styles.list}>
    {Array.from({ length: rows }, (_, i) => (
      <Row key={i} variant={variant} />
    ))}
  </View>
);

export const StatGridSkeleton = () => (
  <View style={styles.list}>
    <View style={styles.grid}>
      {Array.from({ length: 6 }, (_, i) => (
        <SkeletonBlock
          key={i}
          width='47%'
          height={88}
          radius={radii.lg}
          style={styles.cell}
        />
      ))}
    </View>
    <SkeletonBlock height={160} radius={radii.lg} />
  </View>
);

export const ProfileSkeleton = () => (
  <View style={styles.list}>
    <SkeletonBlock width={96} height={96} radius={radii.pill} />
    <SkeletonBlock height={22} width='55%' />
    <SkeletonBlock height={14} width='30%' />
    <SkeletonBlock height={14} />
    <SkeletonBlock height={14} width='80%' />
    <SkeletonBlock height={48} radius={radii.lg} />
    <SkeletonBlock height={56} radius={radii.lg} />
    <SkeletonBlock height={56} radius={radii.lg} />
  </View>
);

/** Header + body placeholder for a screen that is still loading. Announced as one "Loading" element. */
export const ScreenSkeleton = ({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) => (
  <View style={styles.root}>
    {title ? <ScreenHeader title={title} /> : null}
    <View
      accessible
      accessibilityLabel='Loading'
      accessibilityState={{ busy: true }}
      style={styles.body}
    >
      {children}
    </View>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  body: { paddingHorizontal: layout.screenPadding, paddingTop: spacing.lg },
  list: { gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lines: { flex: 1, gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cell: { flexGrow: 1 },
});
