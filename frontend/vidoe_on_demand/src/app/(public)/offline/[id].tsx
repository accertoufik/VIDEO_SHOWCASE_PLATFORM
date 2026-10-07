import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import type { ComponentType } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EmptyState } from '@/components/ui/EmptyState';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassIconButton } from '@/components/ui/GlassIconButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { AppText } from '@/components/ui/Text';
import { colors, layout, spacing } from '@/css';
import { useDownloadActions, useDownloads } from '@/hooks/useDownloads';

// expo-video's typings lag behind its props (allowsFullscreen etc.), so view it through a loose component type.
const LooseVideoView = VideoView as unknown as ComponentType<Record<string, unknown>>;
import { useGoBack } from '@/lib/navigation/useGoBack';
import type { DownloadRecord } from '@/lib/downloads/types';
import { formatBytes } from '@/utils/format';

// Split out so the player is created only once we have a file to play.
const OfflinePlayer = ({ record }: { record: DownloadRecord }) => {
  const insets = useSafeAreaInsets();
  const goBack = useGoBack();
  const router = useRouter();
  const actions = useDownloadActions();

  const player = useVideoPlayer(record.fileUri, (p) => {
    p.play();
  });

  const confirmDelete = () =>
    Alert.alert('Delete download?', 'It will be removed from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          player.pause();
          await actions.remove(record.videoId);
          router.canGoBack() ? router.back() : router.replace('/downloads');
        },
      },
    ]);

  return (
    <View style={styles.root}>
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: colors.background.player,
        }}
      >
        <View style={styles.player}>
          <LooseVideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit='contain'
            nativeControls
            allowsFullscreen
            allowsPictureInPicture
          />
          <View style={styles.back}>
            <GlassIconButton
              icon='chevron-back'
              label='Go back'
              onPress={goBack}
            />
          </View>
        </View>
      </View>
      <View style={styles.body}>
        <AppText variant='h2'>{record.title}</AppText>
        <AppText variant='bodySmall' color='secondary'>
          {record.creatorName}
          {record.sizeBytes ? ` · ${formatBytes(record.sizeBytes)}` : ''} ·
          Saved on this device
        </AppText>
        <GlassButton
          label='Delete download'
          icon='trash-outline'
          variant='danger'
          size='sm'
          onPress={confirmDelete}
        />
      </View>
    </View>
  );
};

const OfflineScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, items } = useDownloads();
  const record = items.find((item) => item.videoId === id);

  if (!ready) {
    return (
      <View style={styles.root}>
        <ScreenHeader title='' />
        <View style={styles.body}>
          <Skeleton width='100%' height={200} radius='md' />
        </View>
      </View>
    );
  }

  if (!record || record.status !== 'completed' || !record.fileUri) {
    return (
      <View style={styles.root}>
        <ScreenHeader title='' />
        <EmptyState
          icon='alert-circle-outline'
          title='Not available offline'
          message="This video isn't downloaded on this device."
        />
      </View>
    );
  }

  return <OfflinePlayer record={record} />;
};

export default OfflineScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  player: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.background.player,
  },
  back: { position: 'absolute', top: spacing.sm, left: spacing.md },
  body: { padding: layout.screenPadding, gap: spacing.md },
});
