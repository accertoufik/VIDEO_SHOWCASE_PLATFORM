import type { ErrorBoundaryProps } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { colors } from '@/css';
import { EmptyNotice } from './EmptyNotice';

/**
 * Expo Router renders this IN PLACE of the layout that crashed, so it must not rely on any provider
 * (query client, auth, toasts). It only uses design tokens and plain components.
 */
export const AppErrorBoundary = ({ error, retry }: ErrorBoundaryProps) => (
  <View style={styles.root}>
    <EmptyNotice
      icon='warning-outline'
      title='Something went wrong'
      message={
        __DEV__ ? error.message : 'We hit an unexpected problem. Please try again.'
      }
      action={{ label: 'Try again', onPress: () => void retry() }}
    />
  </View>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.background.primary,
  },
});
