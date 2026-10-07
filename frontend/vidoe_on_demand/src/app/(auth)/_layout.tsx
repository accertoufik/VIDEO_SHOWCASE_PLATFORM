// import { ClerkLoaded , ClerkProvider, useAuth} from "@clerk/expo";
// import { focusManager, QueryClientProvider } from "@tanstack/react-query";
// import { Slot } from "expo-router";
// import { useEffect } from "react";
// import { StatusBar } from "expo-status-bar";
// import { AppState, Platform, type AppStateStatus } from "react-native";
// import { SafeAreaProvider } from "react-native-safe-area-context";
// import { CLERK_PUBLISHABLE_KEY } from "@/lib/config";
// import { queryClient } from "@/lib/query/queryClient";
// import { tokenCache } from "@/lib/auth/tokenCache";
// import { ToastHost } from "@/components/ui";

// //React Native has no 'window focus' : map app foreground/background to focus/blur, so that react-query can refetch on foreground.
// //so polling/refetching is paused when the app is backgrounded, and resumed when foregrounded.
// const useAppStateFocus = () => {
//   useEffect(() => {
//     if (Platform.OS === "web") return // web has its own focus/blur events, so react-query already handles it.
//       const subscription = AppState.addEventListener("change", (status: AppStateStatus) => {
//         if (status === "active") focusManager.setFocused(true);
//         else focusManager.setFocused(false);
//       });
//       return () => subscription.remove();

//   }, []);
// };

// // Cached responses can contain viewer-specific state (isLiked, isFollowing, private videos).
// // When the signed-in user changes (sign in / out / switch), throw all of it away.
// const AuthCacheReset = () => {
//   const { userId } = useAuth();
//   useEffect(() => {
//     queryClient.clear();
//     tokenCache.saveToken("clerk-session", ""); //clear the cached token too, so that the next request will get a fresh one from Clerk.
//   }, [userId]);
//   return null;
// }

// const RootLayout = () => {
//   useAppStateFocus();

//   return (
//     <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} tokenCache={tokenCache}>
//       <ClerkLoaded>
//         <SafeAreaProvider>
//           <QueryClientProvider client={queryClient}>
//             <AuthCacheReset />
//             <StatusBar style="dark" />
//             <Slot />
//             <ToastHost />
//           </QueryClientProvider>
//         </SafeAreaProvider>
//       </ClerkLoaded>
//     </ClerkProvider>
//   );
// }

// export default RootLayout;

import { useAuth } from '@clerk/clerk-expo';
import { Redirect, Stack, useGlobalSearchParams } from 'expo-router';
import { FullScreenLoader } from '@/components/navigation/FullScreenLoader';
import { stackScreenOptions } from '@/components/navigation/stackScreenOptions';
import { safeRedirect } from '@/lib/auth/redirect';

// The ONLY place that navigates after a successful sign-in/up: once Clerk reports a session, bounce to
// the screen the user came from (?redirect=...) or Home. The forms just call setActive().
const AuthLayout = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const { redirect } = useGlobalSearchParams<{ redirect?: string }>();

  if (!isLoaded) return <FullScreenLoader />;
  if (isSignedIn) return <Redirect href={safeRedirect(redirect)} />;

  return <Stack screenOptions={stackScreenOptions} />;
};

export default AuthLayout;