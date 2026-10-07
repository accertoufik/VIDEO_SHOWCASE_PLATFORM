import { Stack } from 'expo-router';
import { stackScreenOptions } from '@/components/navigation/stackScreenOptions';

// Anonymous-friendly screens: search, trending, category, creator profile, video. No guard.
const PublicLayout = () => <Stack screenOptions={stackScreenOptions} />;

export default PublicLayout;
