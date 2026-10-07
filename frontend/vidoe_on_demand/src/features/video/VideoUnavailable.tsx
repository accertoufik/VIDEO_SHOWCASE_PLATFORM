import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { GlassButton } from '@/components/ui/GlassButton';
import { AppText } from '@/components/ui/Text';
import { colors, spacing } from '@/css';

type Props = { onBack: () => void };

/** Shown when a video can't be opened (removed, made private, wrong link): a clear message and a way out. */
export const VideoUnavailable = ({ onBack }: Props) => {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <Ionicons name='videocam-off-outline' size={44} color={colors.text.primary} />
      <View style={styles.text}>
        <AppText variant='h2' style={styles.center}>
          This video isn't available
        </AppText>
        <AppText variant='bodySmall' color='secondary' style={styles.center}>
          It may have been removed, set to private, or the link is no longer valid.
        </AppText>
      </View>
      <View style={styles.actions}>
        <GlassButton label='Go to Home' icon='home-outline' variant='primary' size='lg' fullWidth onPress={() => router.replace('/')} />
        <GlassButton label='Go back' variant='ghost' fullWidth onPress={onBack} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.xxl,
  },
  text: { gap: spacing.sm, alignItems: 'center', maxWidth: 340 },
  center: { textAlign: 'center' },
  actions: { width: '100%', maxWidth: 320, gap: spacing.sm },
});
