import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useDockInset } from '@/components/navigation/useDockInset';
import { EmptyNotice } from '@/components/ui/EmptyNotice';
import { ListSkeleton, ScreenSkeleton } from '@/components/ui/skeletons';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassIconButton } from '@/components/ui/GlassIconButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { colors, layout, spacing } from '@/css';
import { NotificationRow } from '@/features/notifications/NotificationRow';
import {
  useClearNotifications,
  useMarkAllRead,
  useMarkRead,
} from '@/hooks/mutations/useNotificationMutations';
import { useNotifications } from '@/hooks/queries/useNotifications';
import { notificationHref } from '@/lib/push/notificationRoute';
import type { AppNotification } from '@/types/notification';

const NotificationsScreen = () => {
  const router = useRouter();
  const dockInset = useDockInset();
  const query = useNotifications();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const clear = useClearNotifications();

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );
  const unread = items.filter((n) => !n.read).length;

  if (query.isPending)
    return (
      <ScreenSkeleton title='Notifications'>
        <ListSkeleton variant='avatar' rows={7} />
      </ScreenSkeleton>
    );

  if (query.isError) {
    return (
      <View style={styles.root}>
        <ScreenHeader title='Notifications' />
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </View>
    );
  }

  const confirmClear = () =>
    Alert.alert('Clear all notifications?', 'This removes every notification. It can\'t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: () => clear.mutate() },
    ]);

  const open = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    const href = notificationHref({
      type: n.type,
      videoId: n.videoId,
      username: n.actor?.username,
    });
    if (href) router.push(href);
  };

  return (
    <View style={styles.root}>
      <ScreenHeader
        title='Notifications'
        right={
          items.length > 0 ? (
            <GlassIconButton icon='trash-outline' label='Clear all notifications' danger onPress={confirmClear} />
          ) : undefined
        }
      />
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        renderItem={({ item }) => <NotificationRow item={item} onPress={open} />}
        ListHeaderComponent={
          unread > 0 ? (
            <View style={styles.header}>
              {unread > 0 ? (
                <GlassButton
                  label='Mark all as read'
                  variant='glass'
                  size='sm'
                  loading={markAll.isPending}
                  onPress={() => markAll.mutate()}
                />
              ) : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          <EmptyNotice
            icon='notifications-outline'
            title="You're all caught up"
            message='New followers, comments and video updates will show up here.'
          />
        }
        ListFooterComponent={
          query.isFetchingNextPage ? (
            <ActivityIndicator color={colors.text.primary} style={styles.footer} />
          ) : null
        }
        onEndReached={() =>
          query.hasNextPage && !query.isFetchingNextPage && query.fetchNextPage()
        }
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => query.refetch()}
            tintColor={colors.text.primary}
          />
        }
        contentContainerStyle={[styles.content, { paddingBottom: dockInset }]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default NotificationsScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  header: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.md },
  footer: { paddingVertical: spacing.lg },
});
