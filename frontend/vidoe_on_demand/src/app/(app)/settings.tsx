import { useUser } from '@clerk/clerk-expo';
import { haptics } from '@/lib/haptics';
import { useDockInset } from '@/components/navigation/useDockInset';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { ListGroup, ListRow } from '@/components/ui/ListRow';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { AppText } from '@/components/ui/Text';
import { colors, layout, spacing } from '@/css';
import { Chip } from '@/features/upload/Chip';
import {
  useClearHistory,
} from '@/hooks/mutations/useProfileMutations';
import { useMe } from '@/hooks/queries/useMe';
import { useSignOut } from '@/lib/auth/useSignOut';
import { describeError } from '@/lib/errors/describeError';
import {
  setPreference,
  usePreferences,
  type PreferredQuality,
} from '@/lib/preferences';
import { deleteMyAccount } from '@/api/profile';
import { useApi } from '@/lib/auth/useApi';
import { queryClient } from '@/lib/query/queryClient';
import { toast } from '@/lib/toast';

const QUALITY_OPTIONS: { value: PreferredQuality; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'lowest', label: 'Data saver' },
  { value: 'highest', label: 'Best available' },
];

const SettingsScreen = () => {
  const router = useRouter();
  const dockInset = useDockInset(); // keeps the last items clear of the floating dock
  const me = useMe();
  const prefs = usePreferences();
  const signOut = useSignOut();
  const clearHistory = useClearHistory();

  const isCreator = Boolean(me.data?.creatorProfile);
  // The email comes from the login itself (Clerk): the app's own account data doesn't carry it.
  const email = useUser().user?.primaryEmailAddress?.emailAddress;
  // Show the pending value immediately instead of waiting for the server.

  const confirmSignOut = () =>
    Alert.alert(
      'Sign out?',
      "You'll stop getting notifications on this phone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/');
          },
        },
      ],
    );

  // Switching = sign out, then the sign-in screen, so another account can sign in. (Clerk keeps one active session.)
  const confirmSwitch = () =>
    Alert.alert(
      'Switch account?',
      "You'll be signed out, then you can sign in with a different account.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          onPress: async () => {
            await signOut();
            router.replace('/sign-in');
          },
        },
      ],
    );

  const api = useApi();
  const [deleting, setDeleting] = useState(false);
  const confirmDelete = () =>
    Alert.alert(
      'Delete your account?',
      'This permanently deletes your account. If you are a creator, your channel and all your videos are removed too. You cannot undo this.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            haptics.warning();
            setDeleting(true);
            try {
              await deleteMyAccount(api);
              try {
                await signOut(); // the login is already deleted, so this may complain; we leave either way
              } catch {
                // ignore
              }
              queryClient.clear();
              router.replace('/');
              toast.success('Your account was deleted');
            } catch (error) {
              toast.error(describeError(error).message);
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );

  const confirmClear = () =>
    Alert.alert(
      'Clear watch history?',
      "This also removes your Continue Watching list. You can't undo it.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () =>
            clearHistory.mutate(undefined, {
              onSuccess: () => toast.success('Watch history cleared'),
              onError: (e) => toast.error(describeError(e).message),
            }),
        },
      ],
    );

  const switchProps = {
    trackColor: { false: colors.surface.soft, true: colors.accent.primary },
    thumbColor: colors.text.primary,
  } as const;

  return (
    <View style={styles.root}>
      <ScreenHeader title='Settings' />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: dockInset }]}
        showsVerticalScrollIndicator={false}
      >
        <ListGroup title='Account'>
          <ListRow icon='mail-outline' label='Your email' description={email ?? 'No email on this account'} />
          {isCreator ? (
            <ListRow icon='create-outline' label='Edit channel' onPress={() => router.push('/become-creator')} />
          ) : null}
          <ListRow icon='swap-horizontal-outline' label='Switch account' onPress={confirmSwitch} />
        </ListGroup>

        <ListGroup title='Playback'>
          <ListRow
            icon='play-outline'
            label='Autoplay'
            description='Start videos as soon as they open'
            right={
              <Switch
                {...switchProps}
                value={prefs.autoplay}
                onValueChange={(value) => {
                  haptics.selection();
                  setPreference('autoplay', value);
                }}
                accessibilityLabel='Autoplay'
              />
            }
          />
          <View style={styles.quality}>
            <AppText variant='title'>Default quality</AppText>
            <View style={styles.chips} accessibilityRole='radiogroup'>
              {QUALITY_OPTIONS.map((o) => (
                <Chip
                  key={o.value}
                  label={o.label}
                  selected={prefs.preferredQuality === o.value}
                  onPress={() => setPreference('preferredQuality', o.value)}
                />
              ))}
            </View>
            <AppText variant='bodySmall' color='muted'>
              Auto and Best available follow your connection speed, dropping to a lower quality when it slows down. Data
              saver always plays the smallest. Applies to the next video you open; you can still change it in the player.
            </AppText>
          </View>
        </ListGroup>

        <ListGroup title='General'>
          <ListRow
            icon='phone-portrait-outline'
            label='Haptic feedback'
            description='Small vibrations when you tap, follow or publish'
            right={
              <Switch
                {...switchProps}
                value={prefs.haptics}
                onValueChange={(value) => {
                  // Buzz once as the switch turns ON (when it turns off, silence is the answer).
                  setPreference('haptics', value);
                  if (value) haptics.selection();
                }}
                accessibilityLabel='Haptic feedback'
              />
            }
          />
          <ListRow icon='download-outline' label='Manage downloads' onPress={() => router.push('/downloads')} />
        </ListGroup>

        <ListGroup title='Privacy'>
          <ListRow
            icon='time-outline'
            label='Clear watch history'
            description='Removes your history and Continue Watching'
            onPress={confirmClear}
            disabled={clearHistory.isPending}
          />
        </ListGroup>

        <ListGroup title='About'>
          <ListRow icon='information-circle-outline' label='Version' value={Constants.expoConfig?.version ?? 'dev'} />
        </ListGroup>

        <ListGroup>
          <ListRow icon='log-out-outline' label='Sign out' destructive onPress={confirmSignOut} />
        </ListGroup>

        <ListGroup title='Danger zone'>
          <ListRow
            icon='trash-outline'
            label='Delete account'
            description='Permanently removes your account and everything on it'
            destructive
            onPress={confirmDelete}
            disabled={deleting}
          />
        </ListGroup>
      </ScrollView>
    </View>
  );
};

export default SettingsScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.xl,
  },
  quality: { gap: spacing.sm, padding: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
