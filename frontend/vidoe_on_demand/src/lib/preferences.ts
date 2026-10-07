import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type PreferredQuality = 'auto' | 'lowest' | 'highest';
export type Preferences = {
  autoplay: boolean;
  preferredQuality: PreferredQuality;
  haptics: boolean;
};

const DEFAULTS: Preferences = {
  autoplay: true,
  preferredQuality: 'auto',
  haptics: true,
};
const KEY = 'vod.preferences.v1';
const QUALITIES: PreferredQuality[] = ['auto', 'lowest', 'highest'];

let current: Preferences = DEFAULTS;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Call once at startup. Until it finishes the defaults apply. */
export const hydratePreferences = async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Partial<Preferences>;
    current = {
      autoplay:
        typeof saved.autoplay === 'boolean'
          ? saved.autoplay
          : DEFAULTS.autoplay,
      preferredQuality: QUALITIES.includes(
        saved.preferredQuality as PreferredQuality,
      )
        ? (saved.preferredQuality as PreferredQuality)
        : DEFAULTS.preferredQuality,
      haptics:
        typeof saved.haptics === 'boolean' ? saved.haptics : DEFAULTS.haptics,
    };
    emit();
  } catch {
    // Unreadable storage: keep the defaults.
  }
};

export const setPreference = <K extends keyof Preferences>(
  key: K,
  value: Preferences[K],
) => {
  current = { ...current, [key]: value };
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => current;

/** The current preferences, for code that isn't a component (e.g. haptics). */
export const getPreferences = () => current;

export const usePreferences = () =>
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

/**
 * Which stream to start on. `readyLabels` are the video's finished renditions, tallest first.
 * A preference the video can't satisfy falls back to adaptive ("auto").
 */
export const resolveStreamQuality = (
  preferred: PreferredQuality,
  readyLabels: string[],
): string => {
  if (preferred === 'highest') return readyLabels[0] ?? 'auto';
  if (preferred === 'lowest')
    return readyLabels[readyLabels.length - 1] ?? 'auto';
  return 'auto';
};
