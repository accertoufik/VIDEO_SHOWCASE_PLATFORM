import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullScreenLoader } from '@/components/navigation/FullScreenLoader';
import { ProfileSkeleton, ScreenSkeleton } from '@/components/ui/skeletons';
import { useDockInset } from '@/components/navigation/useDockInset';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassIconButton } from '@/components/ui/GlassIconButton';
import { ListGroup, ListRow } from '@/components/ui/ListRow';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { useCreatorPage } from '@/hooks/queries/useCreator';
import { formatCount } from '@/utils/format';
import { AppText } from '@/components/ui/Text';
import { colors, layout, spacing } from '@/css';
import { ProfileHeader } from '@/features/profile/ProfileHeader';
import { useMe } from '@/hooks/queries/useMe';
import { useUnreadCount } from '@/hooks/queries/useNotifications';

const ProfileTab = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dockInset = useDockInset();
  const { isLoaded, isSignedIn } = useAuth();
  const me = useMe();
  const unread = useUnreadCount().data ?? 0;
  // A creator's follower count comes from their public channel data (the same request the channel page uses).
  const myUsername = me.data?.profile?.username;
  const channel = useCreatorPage(me.data?.creatorProfile && myUsername ? myUsername : '');
  const followers = me.data?.creatorProfile ? (channel.data?.followerCount ?? null) : null;

  // Following / follower counts change as you follow people elsewhere, so refresh them whenever this tab is shown.
  const refetchMe = me.refetch;
  useFocusEffect(
    useCallback(() => {
      if (isSignedIn) void refetchMe();
    }, [isSignedIn, refetchMe]),
  );

  if (!isLoaded) return <FullScreenLoader />;

  if (!isSignedIn) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <AppText variant='h2'>Your profile</AppText>
        <AppText variant='body' color='secondary' style={styles.text}>
          Sign in to follow creators, save videos and keep your watch history.
        </AppText>
        <GlassButton
          label='Sign in'
          variant='primary'
          size='lg'
          onPress={() => router.push('/sign-in')}
        />
      </View>
    );
  }

  if (me.isPending)
    return (
      <ScreenSkeleton>
        <ProfileSkeleton />
      </ScreenSkeleton>
    );
  if (me.isError) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </View>
    );
  }

  const profile = me.data.profile;
  const creator = me.data.creatorProfile;
  const name = profile?.displayName ?? 'Your profile';
  const username = profile?.username ?? '';

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: dockInset + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.top}>
          <AppText variant='h2' accessibilityRole='header'>
            Profile
          </AppText>
          <View style={styles.topActions}>
            <NotificationBell />
            <GlassIconButton icon='settings-outline' label='Settings' onPress={() => router.push('/settings')} />
          </View>
        </View>

        <ProfileHeader
          name={name}
          username={username}
          avatarUrl={profile?.avatarUrl ?? null}
          bannerUrl={creator?.bannerUrl}
          bio={profile?.biography}
          verified={creator?.verificationStatus === 'VERIFIED'}
          stats={[
            { label: 'Following', value: formatCount(me.data.followingCount ?? 0) },
            ...(followers != null
              ? [{ label: followers === 1 ? 'Follower' : 'Followers', value: formatCount(followers) }]
              : []),
          ]}
        />

        <GlassButton
          label='Edit profile'
          variant='glass'
          fullWidth
          onPress={() => router.push('/(app)/edit-profile')}
        />

        {creator ? (
          <ListGroup title={`Your channel · ${creator.channelName}`}>
            <ListRow
              icon='stats-chart-outline'
              label='Creator Studio'
              onPress={() => router.push('/studio')}
            />
            <ListRow
              icon='create-outline'
              label='Edit channel'
              onPress={() => router.push('/become-creator')}
            />
            {username ? (
              <ListRow
                icon='person-circle-outline'
                label='View my channel'
                onPress={() => router.push(`/creator/${username}`)}
              />
            ) : null}
          </ListGroup>
        ) : (
          <ListGroup>
            <ListRow
              highlight
              icon='videocam-outline'
              label='Become a creator'
              onPress={() => router.push('/become-creator')}
            />
          </ListGroup>
        )}

        <ListGroup title='Your library'>
          <ListRow
            icon='albums-outline'
            label='Dashboard'
            onPress={() => router.push('/dashboard')}
          />
          <ListRow
            icon='people-outline'
            label='Following'
            onPress={() => router.push('/following')}
          />
          {me.data?.creatorProfile ? (
            <ListRow
              icon='people-circle-outline'
              label='Followers'
              onPress={() => router.push('/followers')}
            />
          ) : null}
          <ListRow
            icon='notifications-outline'
            label='Notifications'
            value={unread > 0 ? `${unread} new` : undefined}
            onPress={() => router.push('/notifications')}
          />
        </ListGroup>
      </ScrollView>
    </View>
  );
};

export default ProfileTab;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingHorizontal: layout.screenPadding,
  },
  text: { textAlign: 'center' },
  content: { paddingHorizontal: layout.screenPadding, gap: spacing.xl },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
