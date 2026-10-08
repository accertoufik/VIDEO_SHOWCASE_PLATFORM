import { haptics } from '@/lib/haptics';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isApiError } from '@/api/ApiError';
import { GlassButton } from '@/components/ui/GlassButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { colors, radii, spacing } from '@/css';
import { Chip } from '@/features/upload/Chip';
import {
  useChangeThumbnail,
  useDeleteVideo,
  useUpdateVideo,
} from '@/hooks/mutations/useStudioMutations';
import { useCategories } from '@/hooks/queries/useCategories';
import { Thumbnail } from '@/components/video/Thumbnail';
import { describeError } from '@/lib/errors/describeError';
import { pickImage, type PickedImage } from '@/lib/media/pickImage';
import { toast } from '@/lib/toast';
import type { MyVideo } from '@/types/creatorVideo';

// Match the backend limits.
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 5000;

type Props = { video: MyVideo; onClose: () => void };

export const EditVideoSheet = ({ video, onClose }: Props) => {
  const insets = useSafeAreaInsets();
  const categories = useCategories();
  const update = useUpdateVideo();
  const remove = useDeleteVideo();
  const changeThumbnail = useChangeThumbnail();

  const [title, setTitle] = useState(video.title);
  const [description, setDescription] = useState(video.description ?? '');
  const [categoryId, setCategoryId] = useState<string | null>(video.categoryId);
  // A picked-but-not-saved thumbnail: shown in the preview now, uploaded only when "Save changes" is tapped.
  const [newThumbnail, setNewThumbnail] = useState<PickedImage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const busy = update.isPending || remove.isPending || changeThumbnail.isPending;
  const trimmedTitle = title.trim();

  // Only send what changed.
  const changes = {
    ...(trimmedTitle !== video.title ? { title: trimmedTitle } : {}),
    ...(description.trim() !== (video.description ?? '').trim()
      ? { description: description.trim() }
      : {}),
    ...(categoryId && categoryId !== video.categoryId ? { categoryId } : {}),
  };
  const dirty = Object.keys(changes).length > 0 || newThumbnail !== null;

  const fail = (e: unknown) =>
    setError(isApiError(e) ? e.message : describeError(e).message);

  const pickThumbnail = async () => {
    setError(null);
    try {
      const image = await pickImage('thumbnail');
      if (image) setNewThumbnail(image);
    } catch {
      toast.error("Couldn't open your library. Check the app's photo permission in Settings.");
    }
  };

  // Text changes first, then the thumbnail; nothing is sent until now.
  const save = async () => {
    setError(null);
    try {
      if (Object.keys(changes).length > 0) {
        await update.mutateAsync({ videoId: video.id, changes });
      }
      if (newThumbnail) {
        await changeThumbnail.mutateAsync({ videoId: video.id, image: newThumbnail });
      }
      toast.success('Video updated');
      onClose();
    } catch (e) {
      fail(e);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete this video?',
      "It will be removed for everyone, including from followers' lists. You can't undo this from the app.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            haptics.warning();
            setError(null);
            remove.mutate(video.id, {
              onSuccess: () => {
                toast.success('Video deleted');
                onClose();
              },
              onError: fail,
            });
          },
        },
      ],
    );

  return (
    <Modal
      transparent
      animationType='fade'
      visible
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root} accessibilityViewIsModal>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole='button'
          accessibilityLabel='Close'
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + spacing.lg },
            ]}
          >
            <AppText variant='title'>Edit details</AppText>
            <ScrollView
              contentContainerStyle={styles.form}
              keyboardShouldPersistTaps='handled'
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.group}>
                <AppText variant='label'>Thumbnail</AppText>
                <Thumbnail uri={newThumbnail?.uri ?? video.thumbnailUrl} durationMs={video.durationSec != null ? video.durationSec * 1000 : null} radius='md' />
                <GlassButton
                  label={newThumbnail ? 'Choose a different image' : 'Change thumbnail'}
                  icon='image-outline'
                  variant='glass'
                  fullWidth
                  disabled={busy}
                  onPress={pickThumbnail}
                />
              </View>
              <TextField
                label='Title'
                value={title}
                onChangeText={setTitle}
                maxLength={TITLE_MAX}
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
                style={styles.multiline}
              />

              <View style={styles.group}>
                <AppText variant='label'>Category</AppText>
                <View style={styles.wrap} accessibilityRole='radiogroup'>
                  {categories.data?.map((c) => (
                    <Chip
                      key={c.id}
                      label={c.name}
                      selected={categoryId === c.id}
                      onPress={() => setCategoryId(c.id)}
                      disabled={busy}
                    />
                  ))}
                </View>
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
                label='Save changes'
                variant='primary'
                size='lg'
                fullWidth
                loading={update.isPending || changeThumbnail.isPending}
                disabled={!dirty || !trimmedTitle || busy}
                onPress={save}
              />

              <PressableScale
                onPress={confirmDelete}
                disabled={busy}
                accessibilityRole='button'
                accessibilityLabel='Delete video'
                style={styles.delete}
              >
                <AppText variant='label' color='error'>
                  Delete video
                </AppText>
              </PressableScale>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay.scrimStrong,
  },
  sheet: {
    maxHeight: '90%',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    backgroundColor: colors.background.primary,
  },
  form: { gap: spacing.lg },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  group: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  delete: { alignItems: 'center', paddingVertical: spacing.md },
});
