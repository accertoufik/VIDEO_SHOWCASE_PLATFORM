import { StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { colors } from '@/css';
import { FollowersPane } from '@/features/dashboard/LibraryPanes';

const FollowersScreen = () => (
  <View style={styles.root}>
    <ScreenHeader title='Followers' />
    <FollowersPane />
  </View>
);

export default FollowersScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
});
