import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullScreenLoader } from '@/components/navigation/FullScreenLoader';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlassButton } from '@/components/ui/GlassButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { AppText } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { colors, layout, spacing } from '@/css';
import { ChannelImages } from '@/features/creator/ChannelImages';
import {
  useChannelSetup,
  type SetupStep,
} from '@/hooks/mutations/useChannelSetup';
import { useMe } from '@/hooks/queries/useMe';
import { pickImage, type PickedImage } from '@/lib/media/pickImage';
import { toast } from '@/lib/toast';

const ABOUT_MAX = 1500; // matches the backend limit

const stepLabel: Record<SetupStep, string> = {
  idle: '',
  channel: 'Saving your channel…',
  banner: 'Uploading your banner…',
};

// One page for both cases: a viewer sets the banner and description and becomes a creator in the same step; an
// existing creator edits the same two things.
const BecomeCreatorScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const setup = useChannelSetup();

  const existing = Boolean(me.data?.creatorProfile);
  const [about, setAbout] = useState('');
  const [banner, setBanner] = useState<PickedImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // In edit mode, start from what's saved. Only once, so a refetch never overwrites typing.
  const seeded = useRef(false);
  useEffect(() => {
    if (!me.data || seeded.current) return;
    seeded.current = true;
    // Existing channel: its saved text. New channel: start from the profile bio (editable right here).
    setAbout(me.data.creatorProfile?.aboutText ?? me.data.profile?.biography ?? '');
  }, [me.data]);

  if (me.isPending) return <FullScreenLoader />;
  if (me.isError) {
    return (
      <View style={styles.root}>
        <ScreenHeader title='Creator channel' />
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </View>
    );
  }

  const profile = me.data.profile;
  const creator = me.data.creatorProfile;
  const savedAbout = creator?.aboutText ?? '';
  const aboutChanged = about.trim() !== savedAbout.trim();
  const dirty = aboutChanged || banner !== null;

  const chooseBanner = async () => {
    try {
      const picked = await pickImage('banner');
      if (picked) setBanner(picked);
    } catch {
      toast.error(
        "Couldn't open your photos. Check the app's photo permission in Settings.",
      );
    }
  };

  const submit = async () => {
    if (setup.busy) return;
    setError(null);
    const result = await setup.run({
      aboutText: existing ? (aboutChanged ? about.trim() : null) : about.trim() || null,
      banner,
      existing,
    });

    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.warnings.length) {
      toast.error(
        `Your channel is saved, but the ${result.warnings.join(' and ')} couldn't be uploaded. You can try again from Edit channel.`,
      );
    } else {
      toast.success(existing ? 'Channel updated' : 'Your channel is ready');
    }
    router.replace(existing ? '/profile' : '/studio');
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title={existing ? 'Edit channel' : 'Become a creator'} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}
        >
          <ChannelImages
            bannerUri={banner?.uri ?? creator?.bannerUrl ?? null}
            avatarUri={profile?.avatarUrl ?? null}
            name={profile?.displayName ?? ''}
            onPickBanner={chooseBanner}
          />

          <AppText variant='bodySmall' color='muted'>
            {existing
              ? 'Your channel uses your profile name and photo. Change those in Edit profile.'
              : `Your channel will be called @${profile?.username ?? ''} and uses your profile photo. Add a banner and a description below (both optional, editable later).`}
          </AppText>
          {existing ? (
            <GlassButton
              label='Edit profile'
              icon='person-outline'
              variant='glass'
              size='sm'
              onPress={() => router.push('/edit-profile')}
            />
          ) : null}

          <TextField
            label='About your channel'
            value={about}
            onChangeText={setAbout}
            maxLength={ABOUT_MAX}
            multiline
            placeholder='Tell viewers what your videos are about'
            style={styles.about}
          />
          <AppText variant='caption' color='muted' style={styles.counter}>
            {about.length}/{ABOUT_MAX}
          </AppText>

          {error ? (
            <AppText
              variant='bodySmall'
              color='error'
              accessibilityLiveRegion='polite'
            >
              {error}
            </AppText>
          ) : null}

          <GlassButton
            label={
              setup.busy
                ? stepLabel[setup.step]
                : existing
                  ? 'Save changes'
                  : 'Become a creator'
            }
            variant='primary'
            size='lg'
            fullWidth
            loading={setup.busy}
            disabled={existing && !dirty}
            onPress={submit}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default BecomeCreatorScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  about: { minHeight: layout.minTouchTarget * 2, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', marginTop: -spacing.sm },
});
