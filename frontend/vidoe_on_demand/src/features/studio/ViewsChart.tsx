import { StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';
import type { DailyViews } from '@/types/studio';
import { formatCount } from '@/utils/format';

const CHART_HEIGHT = 120;
const MIN_BAR = 2;

// The backend's days are UTC dates, so format them as UTC too (otherwise they can shift by one in your time zone).
const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

type Props = { data: DailyViews[] };

export const ViewsChart = ({ data }: Props) => {
  const total = data.reduce((sum, d) => sum + d.views, 0);
  const peak = data.reduce(
    (best, d) => (d.views > best.views ? d : best),
    data[0] ?? { date: '', views: 0 },
  );
  const max = Math.max(1, peak.views);
  const thin = data.length > 45;

  return (
    <View
      accessible
      accessibilityRole='image'
      accessibilityLabel={
        total === 0
          ? 'Views per day. No views in this period.'
          : `Views per day. ${total} total. Busiest day ${dayLabel(peak.date)} with ${peak.views}.`
      }
    >
      <View style={[styles.bars, { height: CHART_HEIGHT }]}>
        {data.map((d) => (
          <View
            key={d.date}
            style={[styles.slot, { marginHorizontal: thin ? 0.5 : 1 }]}
          >
            <View
              style={[
                styles.bar,
                {
                  height: Math.max(MIN_BAR, (d.views / max) * CHART_HEIGHT),
                  backgroundColor:
                    d.views > 0
                      ? colors.accent.primary
                      : colors.surface.glassMedium,
                },
              ]}
            />
          </View>
        ))}
      </View>

      {data.length > 0 ? (
        <View style={styles.axis}>
          <AppText variant='caption' color='muted'>
            {dayLabel(data[0].date)}
          </AppText>
          {total > 0 ? (
            <AppText variant='caption' color='secondary'>
              Peak {formatCount(peak.views)} · {dayLabel(peak.date)}
            </AppText>
          ) : (
            <AppText variant='caption' color='muted'>
              No views in this period
            </AppText>
          )}
          <AppText variant='caption' color='muted'>
            {dayLabel(data[data.length - 1].date)}
          </AppText>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  bars: { flexDirection: 'row', alignItems: 'flex-end' },
  slot: { flex: 1, justifyContent: 'flex-end' },
  bar: {
    width: '100%',
    borderTopLeftRadius: radii.sm / 4,
    borderTopRightRadius: radii.sm / 4,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
  },
});
