import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

//expo-secure-store has no web implementation; on web Clerk manages its own session storage, so these are no-ops there
const isWeb = Platform.OS === 'web';

//keeps clerk session in the device keychain/keystore, so that the user doesn't have to log in again after closing the app
export const tokenCache = {
    getToken: async (key: string) => {
        if (isWeb) return null;
        try {
            return await SecureStore.getItemAsync(key);
        } catch (error) {
            // A failed READ is not a reason to throw the stored session away: deleting it here is what used to sign
            // people out for good after a one-off keystore hiccup. Report "nothing found" and let the next read retry.
            return null;
        }
    },

    saveToken: async (key: string, token: string) => {
        if (isWeb) return;
        try {
            await SecureStore.setItemAsync(key, token);
        } catch (error) {
            // a storage failure only means the user will have to log in again, so carry on
        }
    },
}