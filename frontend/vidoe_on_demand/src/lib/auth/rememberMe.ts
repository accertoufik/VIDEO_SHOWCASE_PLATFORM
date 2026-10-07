import AsyncStorage from '@react-native-async-storage/async-storage';

const REMEMBER_KEY = 'vod.auth.rememberMe';
const EMAIL_KEY = 'vod.auth.rememberedEmail';

/**
 * "Remember me" only remembers the EMAIL for the sign-in form, so it is already filled in the next time you sign in
 * (for instance after signing out). It never signs anyone out: a login stays active until the user signs out.
 */
export const getRememberMe = async (): Promise<boolean> => {
  try {
    return (await AsyncStorage.getItem(REMEMBER_KEY)) !== '0';
  } catch {
    return true;
  }
};

export const getRememberedEmail = async (): Promise<string> => {
  try {
    return (await AsyncStorage.getItem(EMAIL_KEY)) ?? '';
  } catch {
    return '';
  }
};

export const saveRememberMe = async (remember: boolean, email: string) => {
  try {
    await AsyncStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    if (remember && email) await AsyncStorage.setItem(EMAIL_KEY, email);
    else await AsyncStorage.removeItem(EMAIL_KEY);
  } catch {
    // Storage unavailable: the defaults still apply.
  }
};
