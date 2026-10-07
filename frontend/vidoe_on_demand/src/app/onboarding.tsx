import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { GlassButton } from '@/components/ui/GlassButton';
import { GlassIconButton } from '@/components/ui/GlassIconButton';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { checkUsername, updateProfile, uploadAvatar } from '@/api/profile';
import { colors, radii, spacing } from '@/css';
import { useApi } from '@/lib/auth/useApi';
import { clerkErrorMessage } from '@/lib/auth/clerkError';
import { queryKeys } from '@/lib/query/queryKeys';
import { useMe } from '@/hooks/queries/useMe';

const HANDLE_RE = /^[a-z0-9_]{3,30}$/;

// Popup shown once, right after the first sign-in, until the user has chosen a name and handle.
const OnboardingScreen = () => {
  const router = useRouter();
  const api = useApi();
  const queryClient = useQueryClient();
  const me = useMe();
  const { user } = useUser();
  const editing = me.data?.needsOnboarding === false; // opened from Profile -> Edit profile
  const [displayName, setDisplayName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // First-time setup: suggest the name already on the Google / email account. Only fills an empty box, once.
  const suggested = useRef(false);
  useEffect(() => {
    if (suggested.current || editing || !user) return;
    suggested.current = true;
    const name = user.fullName ?? user.firstName ?? '';
    if (name) setDisplayName((current) => current || name.slice(0, 80));
  }, [editing, user]);

  // When editing, start from what's saved. Runs once, so it never overwrites what the user is typing.
  const prefilled = useRef(false);
  useEffect(() => {
    const profile = me.data?.profile;
    if (prefilled.current || !editing || !profile) return;
    prefilled.current = true;
    setDisplayName(profile.displayName);
    setHandle(profile.username);
    setBio(profile.biography ?? '');
  }, [editing, me.data?.profile]);

  const cleanHandle = handle.trim().toLowerCase().replace(/^@/, '');
  const handleOk = HANDLE_RE.test(cleanHandle);

  // Live availability check, 450 ms after the user stops typing. Stale answers are discarded.
  const [availability, setAvailability] = useState<'idle' | 'checking' | 'available' | 'taken' | 'failed'>('idle');
  useEffect(() => {
    if (editing || !handleOk) {
      setAvailability('idle');
      return;
    }
    setAvailability('checking');
    const controller = new AbortController();
    const timer = setTimeout(() => {
      checkUsername(api, cleanHandle, controller.signal)
        .then((r) => setAvailability(r.available ? 'available' : 'taken'))
        .catch(() => {
          if (!controller.signal.aborted) setAvailability('failed');
        });
    }, 450);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [api, cleanHandle, editing, handleOk]);

  // 'failed' (network blip) doesn't block saving: the server still enforces uniqueness.
  const canSave =
    displayName.trim().length > 0 &&
    (editing || (handleOk && availability !== 'taken' && availability !== 'checking')) &&
    !saving;

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) setPhoto(result.assets[0] ?? null);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await updateProfile(api, {
        displayName: displayName.trim(),
        ...(editing ? {} : { username: cleanHandle }),
        ...(bio.trim() ? { biography: bio.trim() } : {}),
      });
      if (photo) await uploadAvatar(api, photo);
      await queryClient.invalidateQueries({ queryKey: queryKeys.me });
      if (router.canGoBack() && editing) router.back();
      else router.replace('/');
    } catch (e) {
      setError(clerkErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.topBar}>
        {editing ? (
          <GlassIconButton
            icon='close'
            label='Close'
            variant='plain'
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
          />
        ) : null}
      </View>

      <View style={styles.header}>
        <AppText variant='h1' accessibilityRole='header'>
          {editing ? 'Edit profile' : 'Set up your profile'}
        </AppText>
        <AppText variant='bodySmall' color='secondary'>
          {editing ? 'Update how you appear to others.' : 'Tell people who you are. You can change your name and bio later.'}
        </AppText>
      </View>

      <Pressable
        onPress={pickPhoto}
        accessibilityRole='button'
        accessibilityLabel='Choose a profile photo'
        style={styles.avatarPick}
      >
        <View>
          <Avatar
            uri={photo?.uri ?? (editing ? me.data?.profile?.avatarUrl : null)}
            name={displayName || '?'}
            size='xl'
          />
          <View style={styles.camera}>
            <Ionicons name='camera' size={16} color={colors.text.inverse} />
          </View>
        </View>
        <AppText variant='label' color='accent'>
          {photo ? 'Change photo' : 'Add a photo'}
        </AppText>
      </Pressable>

      <View style={styles.form}>
        <TextField
          label='Display name'
          icon='person-outline'
          value={displayName}
          onChangeText={setDisplayName}
          maxLength={80}
          autoComplete='name'
          placeholder='Your name'
        />

        {editing ? (
          // Already chosen, and permanent.
          <View style={styles.permanent}>
            <Ionicons name='lock-closed-outline' size={18} color={colors.icon.muted} />
            <View style={styles.permanentText}>
              <AppText variant='label' color='secondary'>
                Username
              </AppText>
              <AppText variant='body'>@{me.data?.profile?.username}</AppText>
              <AppText variant='caption' color='muted'>
                Your username is permanent. Your channel uses it.
              </AppText>
            </View>
          </View>
        ) : (
          <View style={styles.field}>
            <TextField
              label='Username'
              icon='at-outline'
              value={handle}
              onChangeText={setHandle}
              autoCapitalize='none'
              autoCorrect={false}
              maxLength={31}
              placeholder='e.g. jane_doe'
              error={
                handle && !handleOk
                  ? '3-30 characters: letters, numbers or underscores.'
                  : availability === 'taken'
                    ? 'This username is already taken.'
                    : null
              }
              helper={
                availability === 'available'
                  ? { text: '\u2713 This username is available', tone: 'success' }
                  : availability === 'checking'
                    ? { text: 'Checking...', tone: 'muted' }
                    : null
              }
            />
            <View style={styles.notice}>
              <Ionicons name='information-circle-outline' size={16} color={colors.icon.muted} />
              <AppText variant='caption' color='muted' style={styles.noticeText}>
                Choose carefully: your username is unique and can't be changed later. Your channel will use it.
              </AppText>
            </View>
          </View>
        )}

        <TextField
          label='About you (optional)'
          value={bio}
          onChangeText={setBio}
          multiline
          maxLength={500}
          placeholder='A short description'
          style={styles.bio}
        />
        <AppText variant='caption' color='muted' style={styles.counter}>
          {bio.length}/500
        </AppText>

        {error ? (
          <AppText variant='bodySmall' color='error' accessibilityLiveRegion='polite'>
            {error}
          </AppText>
        ) : null}
        <GlassButton
          label={editing ? 'Save changes' : 'Save and continue'}
          variant='primary'
          size='lg'
          fullWidth
          loading={saving}
          disabled={!canSave}
          onPress={save}
        />
      </View>
    </Screen>
  );
};

export default OnboardingScreen;

const styles = StyleSheet.create({
  topBar: { alignItems: 'flex-start', minHeight: 44, marginLeft: -spacing.sm },
  header: { gap: spacing.xs, paddingBottom: spacing.xl },
  avatarPick: { alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.xl },
  camera: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.primary,
    borderWidth: 3,
    borderColor: colors.background.primary,
  },
  form: { gap: spacing.lg },
  field: { gap: spacing.sm },
  notice: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  noticeText: { flex: 1 },
  permanent: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radii.md,
    backgroundColor: colors.surface.input,
  },
  permanentText: { flex: 1, gap: 2 },
  bio: { minHeight: 88, textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end', marginTop: -spacing.md },
});
