import { StyleSheet, View } from 'react-native';
import { ScreenHeader } from '@/components/ui/ScreenHeader';
import { colors } from '@/css';
import { FollowingPane } from '@/features/dashboard/LibraryPanes';

const FollowingScreen = () => (
  <View style={styles.root}>
    <ScreenHeader title='Following' />
    <FollowingPane />
  </View>
);

export default FollowingScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
});
