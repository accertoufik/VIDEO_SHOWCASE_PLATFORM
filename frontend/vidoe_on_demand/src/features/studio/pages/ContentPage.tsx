import { useDockInset } from '@/components/navigation/useDockInset';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { EmptyNotice } from '@/components/ui/EmptyNotice';
import { ListSkeleton, ScreenSkeleton } from '@/components/ui/skeletons';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlassButton } from '@/components/ui/GlassButton';
import { colors, layout, spacing } from '@/css';
import { EditVideoSheet } from '@/features/creator/EditVideoSheet';
import { MyVideoRow } from '@/features/creator/MyVideoRow';
import { PublishSheet } from '@/features/creator/PublishSheet';
import { useMyVideos } from '@/hooks/queries/useMyVideos';
import type { MyVideo } from '@/types/creatorVideo';

export const ContentPage = () => {
  const router = useRouter();
  const dockInset = useDockInset(); // keeps the last items clear of the floating dock
  const videos = useMyVideos();
  const [publishing, setPublishing] = useState<MyVideo | null>(null);
  const [editing, setEditing] = useState<MyVideo | null>(null);

  if (videos.isPending)
    return (
      <ScreenSkeleton>
        <ListSkeleton rows={4} />
      </ScreenSkeleton>
    );

  if (videos.isError) {
    return (
      <View style={styles.root}>
          <ErrorState error={videos.error} onRetry={() => videos.refetch()} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={videos.data}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => (
          <MyVideoRow
            video={item}
            onPublish={setPublishing}
            onEdit={setEditing}
            onAnalytics={(v) =>
              router.push({ pathname: '/analytics', params: { videoId: v.id } })
            }
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <GlassButton
              label='Upload a video'
              variant='glass'
              fullWidth
              onPress={() => router.push('/upload')}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyNotice
            icon='videocam-outline'
            title='No videos yet'
            message='Upload your first video. It stays private until you publish it.'
            action={{ label: 'Upload a video', onPress: () => router.push('/upload') }}
          />
        }
        contentContainerStyle={[
          styles.content,
          { paddingBottom: dockInset },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={videos.isRefetching}
            onRefresh={() => videos.refetch()}
            tintColor={colors.text.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {publishing ? (
        <PublishSheet
          key={publishing.id}
          video={publishing}
          onClose={() => setPublishing(null)}
        />
      ) : null}
      {editing ? (
        <EditVideoSheet
          key={editing.id}
          video={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </View>
  );
};


const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: spacing.sm },
  header: { gap: spacing.lg, paddingBottom: spacing.lg },
  separator: { height: spacing.lg },
});
