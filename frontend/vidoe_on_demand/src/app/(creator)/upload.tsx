import { haptics } from '@/lib/haptics';
import { useNavigation, useRouter } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RemoteImage as Image } from '@/components/ui/RemoteImage';
import { GlassButton } from '@/components/ui/GlassButton';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { AppText } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { colors, layout, radii, spacing } from '@/css';
import { Chip } from '@/features/upload/Chip';
import { UploadProgress } from '@/features/upload/UploadProgress';
import { VideoPickerCard } from '@/features/upload/VideoPickerCard';
import { PressableScale } from '@/components/ui/PressableScale';
import { useVideoUpload } from '@/hooks/mutations/useVideoUpload';
import { useCategories } from '@/hooks/queries/useCategories';
import { pickImage, type PickedImage } from '@/lib/media/pickImage';
import { pickVideo, type PickedVideo } from '@/lib/media/pickVideo';
import { toast } from '@/lib/toast';

// Match the backend limits.
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;
const KEEP_AWAKE_TAG = 'video-upload';

const UploadScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const categories = useCategories();
  const upload = useVideoUpload();

  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [thumbnail, setThumbnail] = useState<PickedImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keep the screen on while uploading: a locked phone suspends the transfer.
  useEffect(() => {
    if (!upload.busy) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG);
    };
  }, [upload.busy]);

  // Don't let a swipe-back or the Android back button silently kill an upload.
  useEffect(() => {
    if (!upload.busy) return;
    return navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert('Cancel upload?', "Your video hasn't finished uploading.", [
        { text: 'Keep uploading', style: 'cancel' },
        {
          text: 'Cancel upload',
          style: 'destructive',
          onPress: () => {
            upload.cancel();
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
  }, [navigation, upload.busy, upload.cancel]);

  const choosePhoto = async (kind: 'video' | 'thumbnail') => {
    try {
      if (kind === 'video') {
        const picked = await pickVideo();
        if (!picked) return;
        setVideo(picked); // the title is typed by the creator: it is never filled in from the file name
      } else {
        const picked = await pickImage('thumbnail');
        if (picked) setThumbnail(picked);
      }
    } catch {
      toast.error(
        "Couldn't open your library. Check the app's photo permission in Settings.",
      );
    }
  };

  const canSubmit =
    Boolean(video && title.trim() && categoryId) && !upload.busy;

  const submit = async () => {
    if (!video || !categoryId || !canSubmit) return;
    setError(null);

    const result = await upload.run({
      video,
      title: title.trim(),
      description: description.trim(),
      categoryId,
      thumbnail,
    });

    if (!result.ok) {
      if (!result.cancelled) setError(result.error);
      return;
    }
    toast.success(
      result.thumbnailFailed
        ? "Uploaded. Your thumbnail couldn't be saved, so we'll pick one for you."
        : "Upload complete. We're processing your video.",
    );
    haptics.success();
    router.replace('/content');
  };

  return (
    <View style={styles.root}>
      <ScreenHeader title='Upload video' />
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
          {upload.busy ? (
            <UploadProgress
              phase={upload.phase}
              progress={upload.progress}
              onCancel={upload.cancel}
            />
          ) : (
            <>
              <VideoPickerCard
                video={video}
                onPress={() => choosePhoto('video')}
              />

              <TextField
                label='Title'
                value={title}
                onChangeText={setTitle}
                maxLength={TITLE_MAX}
                placeholder='Give your video a title'
                autoCorrect={false}
                autoCapitalize='none'
                spellCheck={false}
                autoComplete='off'
                importantForAutofill='no'
              />

              <TextField
                label='Description'
                value={description}
                onChangeText={setDescription}
                maxLength={DESCRIPTION_MAX}
                multiline
                placeholder="Tell viewers what it's about (optional)"
                style={styles.multiline}
              />

              <View style={styles.group}>
                <AppText variant='label'>Category</AppText>
                {categories.isPending ? (
                  <AppText variant='bodySmall' color='muted'>
                    Loading categories…
                  </AppText>
                ) : categories.isError ? (
                  <GlassButton
                    label="Couldn't load categories. Retry"
                    variant='glass'
                    onPress={() => categories.refetch()}
                  />
                ) : (
                  <View style={styles.wrapRow} accessibilityRole='radiogroup'>
                    {categories.data.map((c) => (
                      <Chip
                        key={c.id}
                        label={c.name}
                        selected={categoryId === c.id}
                        onPress={() => setCategoryId(c.id)}
                      />
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.group}>
                <AppText variant='label'>Thumbnail</AppText>
                <View style={styles.wrapRow} accessibilityRole='radiogroup'>
                  <Chip
                    label='Automatic'
                    selected={!thumbnail}
                    onPress={() => setThumbnail(null)}
                  />
                  <Chip
                    label='Choose image'
                    selected={Boolean(thumbnail)}
                    onPress={() => choosePhoto('thumbnail')}
                  />
                </View>
                {thumbnail ? (
                  <PressableScale
                    onPress={() => choosePhoto('thumbnail')}
                    accessibilityRole='button'
                    accessibilityLabel='Change thumbnail'
                    style={styles.thumb}
                  >
                    <Image
                      source={{ uri: thumbnail.uri }}
                      style={StyleSheet.absoluteFill}
                      contentFit='cover'
                      accessibilityIgnoresInvertColors
                    />
                  </PressableScale>
                ) : (
                  <AppText variant='bodySmall' color='muted'>
                    We'll grab a frame from your video.
                  </AppText>
                )}
              </View>

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
                label={error ? 'Try again' : 'Upload'}
                variant='primary'
                size='lg'
                fullWidth
                disabled={!canSubmit}
                onPress={submit}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default UploadScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  flex: { flex: 1 },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    gap: spacing.lg,
  },
  multiline: { minHeight: layout.minTouchTarget * 2, textAlignVertical: 'top' },
  group: { gap: spacing.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // 16:9 preview matching the thumbnail crop.
  thumb: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface.glassMedium,
  },
});
