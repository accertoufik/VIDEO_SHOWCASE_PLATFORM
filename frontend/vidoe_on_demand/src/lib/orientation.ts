import * as ScreenOrientation from 'expo-screen-orientation';

/** The app stays in portrait... */
export const lockToPortrait = () =>
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});

/** ...except the full-screen video player, which turns to landscape. */
export const lockForFullscreenVideo = () =>
  ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
