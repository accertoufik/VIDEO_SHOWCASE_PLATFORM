import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, usePathname, useRouter } from 'expo-router';
import { lockToPortrait } from '@/lib/orientation';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import {
  OpenSans_400Regular,
  OpenSans_500Medium,
  OpenSans_600SemiBold,
  OpenSans_700Bold,
  OpenSans_800ExtraBold,
  useFonts as useOpenSans,
} from '@expo-google-fonts/open-sans';
import { BitcountInk_700Bold, useFonts as useBitcount } from '@expo-google-fonts/bitcount-ink';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FullScreenLoader } from '@/components/navigation/FullScreenLoader';
import { GlassDock } from '@/components/navigation/GlassDock';
import { FullscreenProvider } from '@/components/video/FullscreenHost';
import { SessionRecovery } from '@/features/auth/SessionRecovery';
import { DownloadsAccountSync } from '@/features/downloads/DownloadsAccountSync';
import { VideoReadyWatcher } from '@/features/creator/VideoReadyWatcher';
import { stackScreenOptions } from '@/components/navigation/stackScreenOptions';
import { ToastHost } from '@/components/ui';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { colors } from '@/css';
import { CLERK_PUBLISHABLE_KEY } from '@/lib/config';
import { tokenCache } from '@/lib/auth/tokenCache';
import { queryClient } from '@/lib/query/queryClient';
import { useMe } from '@/hooks/queries/useMe';
import { hydratePreferences } from '@/lib/preferences';
import { installQueryLifecycle } from '@/lib/query/lifecycle';

// Keep the native splash up until Tamasa's fonts are ready, so text never flashes in the system font.
void SplashScreen.preventAutoHideAsync().catch(() => {});

// Load saved preferences (autoplay, preferred quality, ...) before the first screen needs them.
void hydratePreferences();

// Teach TanStack Query about the network (pause offline, resume on reconnect) and about app foregrounding.
installQueryLifecycle();

// A friendly screen if something crashes while rendering (Expo Router picks this export up automatically).
export { AppErrorBoundary as ErrorBoundary } from '@/components/ui/AppErrorBoundary';

// Deep links into (public)/video/[id] etc. still get the tabs underneath for a sensible Back.
export const unstable_settings = { anchor: '(tabs)' };

// While Clerk restores the saved login, show the Tamasha loading screen (the one the native splash hands over to)
// instead of a blank page. Replaces <ClerkLoaded>, which renders nothing until it is ready.
const AuthReady = ({ children }: { children: ReactNode }) => {
  const { isLoaded } = useAuth();
  return isLoaded ? <>{children}</> : <FullScreenLoader />;
};

const AuthCacheReset = () => {
  const { userId } = useAuth();
  useEffect(() => {
    queryClient.clear();
  }, [userId]);
  return null;
};

// First sign-in: if the profile is still the placeholder created at sign-up, show the setup popup.
const OnboardingGate = () => {
  const { isSignedIn } = useAuth();
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  // Required: nothing else opens until the profile has a real name and handle.
  const needs = Boolean(isSignedIn && me.data?.needsOnboarding);

  useEffect(() => {
    if (needs && pathname !== '/onboarding') router.replace('/onboarding');
  }, [needs, pathname, router]);

  return null;
};

// Screens that need the whole display (the player) or are forms/modals don't get the dock.
const NO_DOCK = ['/video/', '/sign-in', '/sign-up', '/forgot-password', '/onboarding', '/upload', '/become-creator'];

const RootDock = () => {
  const pathname = usePathname();
  if (NO_DOCK.some((p) => pathname.startsWith(p))) return null;
  // Fades in a moment after the screen changes, so going Back from a full-screen page (the player) doesn't show the
  // dock popping over the page that is still sliding away.
  return (
    <Animated.View pointerEvents='box-none' entering={FadeIn.delay(140).duration(200)} style={StyleSheet.absoluteFill}>
      <GlassDock />
    </Animated.View>
  );
};

const RootLayout = () => {
  const [openSansReady] = useOpenSans({
    OpenSans_400Regular,
    OpenSans_500Medium,
    OpenSans_600SemiBold,
    OpenSans_700Bold,
    OpenSans_800ExtraBold,
  });
  const [bitcountReady] = useBitcount({ BitcountInk_700Bold });
  const fontsReady = openSansReady && bitcountReady;

  useEffect(() => {
    if (fontsReady) void SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  // app.json allows every orientation (the video player needs landscape); everything else stays portrait.
  useEffect(() => {
    void lockToPortrait();
  }, []);

  if (!fontsReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background.primary }}>
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      tokenCache={tokenCache}
    >
      <AuthReady>
        <QueryClientProvider client={queryClient}>
          <SafeAreaProvider>
            <FullscreenProvider>
            <AuthCacheReset />
            <SessionRecovery />
            <OnboardingGate />
            <StatusBar style='light' />
            <Stack screenOptions={stackScreenOptions}>
              <Stack.Screen name='(tabs)' />
              <Stack.Screen name='(public)' />
              <Stack.Screen name='(app)' />
              <Stack.Screen name='(creator)' />
              {/* Sign-in appears as a modal over whatever the user was browsing. */}
              <Stack.Screen
                name='(auth)'
                options={{
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }}
              />
              <Stack.Screen
                name='onboarding'
                options={{
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                  gestureEnabled: false, // required step: can't be swiped away
                }}
              />
            </Stack>
            <RootDock />
            <VideoReadyWatcher />
            <DownloadsAccountSync />
            <OfflineBanner />
            <ToastHost />
            </FullscreenProvider>
          </SafeAreaProvider>
        </QueryClientProvider>
      </AuthReady>
    </ClerkProvider>
    </GestureHandlerRootView>
  );
};

export default RootLayout;
