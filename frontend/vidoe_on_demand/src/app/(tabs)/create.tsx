import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { FullScreenLoader } from '@/components/navigation/FullScreenLoader';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/Text';
import { spacing } from '@/css';
import { CreateOptionCard } from '@/features/create/CreateOptionCard';
import { useCreateDestination } from '@/lib/auth/useCreateDestination';

// The "+" surface. Signed-out visitors and viewers who aren't creators yet are sent on to sign-in / channel setup;
// creators see their creation options: upload a video, create a Short, or open Creator Studio.
const CreateScreen = () => {
  const { href, loading } = useCreateDestination();
  const router = useRouter();

  if (loading) return <FullScreenLoader />;
  if (href !== '/create') return <Redirect href={href} />;

  return (
    <Screen scroll dock>
      <View style={styles.header}>
        <AppText variant='h1' accessibilityRole='header'>
          Create
        </AppText>
        <AppText variant='body' color='secondary'>
          Share your story with Tamasa
        </AppText>
      </View>

      <View style={styles.grid}>
        <CreateOptionCard
          icon='cloud-upload-outline'
          title='Upload video'
          hint='From your gallery'
          onPress={() => router.push('/upload')}
        />
        <CreateOptionCard
          icon='flash-outline'
          title='Create Short'
          hint='Vertical videos are detected as Shorts'
          onPress={() => router.push('/upload')}
        />
      </View>

      <CreateOptionCard
        wide
        icon='stats-chart-outline'
        title='Creator Studio'
        hint='Overview, content and comments'
        onPress={() => router.push('/studio')}
      />
    </Screen>
  );
};

export default CreateScreen;

const styles = StyleSheet.create({
  header: { gap: spacing.xs, paddingVertical: spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginBottom: spacing.md },
});
