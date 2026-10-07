import { Tabs } from 'expo-router';
import { colors } from '@/css';

// Declaration ORDER = dock order. The dock is absolutely positioned, so content runs underneath it
// (screens add bottom padding with <Screen dock /> or useDockInset()).
const TabsLayout = () => (
  <Tabs
    // The dock is drawn once by the root layout (so it also shows on Dashboard, Following, ...).
    tabBar={() => null}
    screenOptions={{
      headerShown: false,
      tabBarStyle: { position: 'absolute' },
      sceneStyle: { backgroundColor: colors.background.primary },
    }}
  >
    <Tabs.Screen name='index' options={{ title: 'Home' }} />
    <Tabs.Screen name='shorts' options={{ title: 'Shorts' }} />
    <Tabs.Screen name='create' options={{ title: 'Create' }} />
    <Tabs.Screen name='downloads' options={{ title: 'Downloads' }} />
    <Tabs.Screen name='profile' options={{ title: 'Profile' }} />
  </Tabs>
);

export default TabsLayout;
