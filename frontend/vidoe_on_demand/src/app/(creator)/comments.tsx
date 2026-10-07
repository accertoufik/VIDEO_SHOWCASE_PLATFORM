import { Redirect, useLocalSearchParams } from 'expo-router';

// Kept so old links still work: the section now lives inside the swipeable Studio.
export default function CommentsRedirect() {
  const { videoId } = useLocalSearchParams<{ videoId?: string }>();
  return <Redirect href={{ pathname: '/studio', params: { tab: 'comments', ...(videoId ? { videoId } : {}) } }} />;
}
