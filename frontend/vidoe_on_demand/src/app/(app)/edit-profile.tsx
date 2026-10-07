import { useDockInset } from '@/components/navigation/useDockInset';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { RemoteImage as Image } from '@/components/ui/RemoteImage';
import { FullScreenLoader } from '@/components/navigation/FullScreenLoader';
import { Avatar } from '@/components/ui/Avatar';
import { ErrorState } from '@/components/ui/ErrorState';
import { GlassButton } from '@/components/ui/GlassButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { AppText } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { colors, layout, spacing } from '@/css';
import { useProfileEdit } from '@/hooks/mutations/useProfileMutations';
import { useMe } from '@/hooks/queries/useMe';
import { pickImage, type PickedImage } from '@/lib/media/pickImage';
import { toast } from '@/lib/toast';

// Match the backend limits.
const NAME_MAX = 80;
const BIO_MAX = 500;

const EditProfileScreen = () => {
  const router = useRouter();
  const dockInset = useDockInset(); // keeps the last items clear of the floating dock
  const me = useMe();
  const edit = useProfileEdit();

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatar, setAvatar] = useState<PickedImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Start from what's saved, once, so a refetch never overwrites typing.
  const seeded = useRef(false);
  useEffect(() => {
    const profile = me.data?.profile;
    if (profile && !seeded.current) {
      seeded.current = true;
      setName(profile.displayName ?? '');
      setBio(profile.biography ?? '');
    }
  }, [me.data]);

  if (me.isPending) return <FullScreenLoader />;
  if (me.isError) {
    return (
      <View style={styles.root}>
        <ScreenHeader title='Edit profile' />
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </View>
    );
  }

  const profile = me.data.profile;
  const trimmedName = name.trim();
  const nameChanged = trimmedName !== (profile?.displayName ?? '');
  const bioChanged = bio.trim() !== (profile?.biography ?? '').trim();
  const dirty = nameChanged || bioChanged || avatar !== null;

  const choosePhoto = async () => {
    try {
      const picked = await pickImage('avatar');
      if (picked) setAvatar(picked);
    } catch {
      toast.error(
        "Couldn't open your photos. Check the app's photo permission in Settings.",
      );
    }
  };

  const save = async () => {
    if (!trimmedName || edit.busy) return;
    setError(null);
    const result = await edit.run({
      changes: {
        ...(nameChanged ? { displayName: trimmedName } : {}),
        ...(bioChanged ? { biography: bio.trim() } : {}),
      },
      avatar,
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    toast[result.avatarFailed ? 'error' : 'success'](
      result.avatarFailed
        ? "Saved, but your photo couldn't be uploaded. Try again."
        : 'Profile updated',
    );
    router.back();
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title='Edit profile' />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: dockInset },
          ]}
          keyboardShouldPersistTaps='handled'
          showsVerticalScrollIndicator={false}
        >
          <PressableScale
            onPress={choosePhoto}
            accessibilityRole='button'
            accessibilityLabel='Change profile photo'
            style={styles.photo}
          >
            {avatar ? (
              <Image
                source={{ uri: avatar.uri }}
                style={styles.preview}
                contentFit='cover'
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Avatar
                uri={profile?.avatarUrl ?? null}
                name={trimmedName || profile?.displayName || '?'}
                size='xl'
              />
            )}
            <AppText variant='label' color='accent'>
              Change photo
            </AppText>
          </PressableScale>

          <TextField
            label='Display name'
            value={name}
            onChangeText={setName}
            maxLength={NAME_MAX}
            autoCapitalize='words'
            error={name.length > 0 && !trimmedName ? 'Required' : null}
          />

          {/* Permanent: a creator's channel is named after it, and it is how people find and link to you. */}
          <View style={styles.readonly}>
            <AppText variant='label' color='secondary'>
              Username
            </AppText>
            <AppText variant='body'>@{profile?.username}</AppText>
            <AppText variant='caption' color='muted'>
              Your username is permanent. Your channel uses it.
            </AppText>
          </View>

          <TextField
            label='Bio'
            value={bio}
            onChangeText={setBio}
            maxLength={BIO_MAX}
            multiline
            placeholder='Tell people a little about you'
            style={styles.bio}
          />
          <AppText variant='caption' color='muted' style={styles.counter}>
            {bio.length}/{BIO_MAX}
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
            label='Save'
            variant='primary'
            size='lg'
            fullWidth
            loading={edit.busy}
            disabled={!dirty || !trimmedName}
            onPress={save}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default EditProfileScreen;

const styles = StyleSheet.create({
  readonly: { gap: spacing.xs },
  root: { flex: 1, backgroundColor: colors.background.primary },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  photo: { alignItems: 'center', gap: spacing.sm },
  preview: { width: 96, height: 96, borderRadius: 48 },
  bio: { minHeight: layout.minTouchTarget * 2, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', marginTop: -spacing.sm },
});
