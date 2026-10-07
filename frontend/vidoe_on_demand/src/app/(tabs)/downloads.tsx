import { useRouter } from 'expo-router';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDockInset } from '@/components/navigation/useDockInset';
import { EmptyHero } from '@/components/ui/EmptyHero';
import { Skeleton } from '@/components/ui/Skeleton';
import { AppText } from '@/components/ui/Text';
import { colors, layout, spacing } from '@/css';
import { DownloadRow } from '@/features/downloads/DownloadRow';
import { useDownloadActions, useDownloads } from '@/hooks/useDownloads';
import type { DownloadRecord } from '@/lib/downloads/types';
import { formatBytes } from '@/utils/format';

const DownloadsScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockInset = useDockInset();
  const { ready, items } = useDownloads();
  const actions = useDownloadActions();

  const used = items.reduce(
    (sum, item) =>
      sum + (item.status === 'completed' ? (item.sizeBytes ?? 0) : 0),
    0,
  );

  const confirmDelete = (record: DownloadRecord) =>
    Alert.alert(
      'Delete download?',
      `"${record.title}" will be removed from this device. You can download it again later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void actions.remove(record.videoId),
        },
      ],
    );

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
      <AppText variant='h1' accessibilityRole='header'>
        Downloads
      </AppText>
      <AppText variant='bodySmall' color='secondary'>
        {items.length
          ? `${items.length} ${items.length === 1 ? 'video' : 'videos'} · ${formatBytes(used)} on this device`
          : 'Videos saved for offline viewing'}
      </AppText>
    </View>
  );

  return (
    <FlatList
      style={styles.list}
      data={ready ? items : []}
      keyExtractor={(item) => item.videoId}
      renderItem={({ item }) => (
        <View style={styles.item}>
          <DownloadRow
            record={item}
            onOpen={(record) =>
              router.push({
                pathname: '/offline/[id]',
                params: { id: record.videoId },
              })
            }
            onCancel={(record) => actions.cancel(record.videoId)}
            onRetry={(record) => void actions.retry(record)}
            onDelete={confirmDelete}
          />
        </View>
      )}
      ListHeaderComponent={header}
      ListEmptyComponent={
        !ready ? (
          <View style={styles.item}>
            <Skeleton width='100%' height={73} radius='md' />
          </View>
        ) : (
          <EmptyHero
            icon='cloud-download-outline'
            title='Nothing saved for offline'
            message='Open a video and tap Download. It will wait here, ready to watch without internet.'
            action={{ label: 'Browse videos', icon: 'compass-outline', onPress: () => router.navigate('/') }}
          />
        )
      }
      ItemSeparatorComponent={() => <View style={styles.gap} />}
      contentContainerStyle={{ paddingBottom: dockInset }}
      showsVerticalScrollIndicator={false}
    />
  );
};

export default DownloadsScreen;

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background.primary },
  header: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.lg,
    gap: spacing.xs,
  },
  item: { paddingHorizontal: layout.screenPadding },
  gap: { height: spacing.lg },
});
