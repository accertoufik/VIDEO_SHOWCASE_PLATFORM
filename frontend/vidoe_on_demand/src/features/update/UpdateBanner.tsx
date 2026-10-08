import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui/Text';
import { colors, radii, spacing } from '@/css';

// Sideloaded APKs don't update themselves, so the website publishes the newest version here. Edit it
// (~/tamasa-download/version.json) each time a new APK is released.
const VERSION_URL = 'https://www.toufiktamasa.tech/version.json';

const parts = (v: string) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);
const isNewer = (latest: string, current: string) => {
  const a = parts(latest);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  return false;
};

/** A one-line "new version" notice that links to the download page. Silent if offline or up to date. */
export const UpdateBanner = () => {
  const [info, setInfo] = useState<{ latest: string; url: string } | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const current = Constants.expoConfig?.version;
    if (!current) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    fetch(VERSION_URL, { signal: controller.signal, headers: { 'Cache-Control': 'no-cache' } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { latest?: string; url?: string } | null) => {
        if (data?.latest && isNewer(data.latest, current)) {
          setInfo({ latest: data.latest, url: data.url ?? 'https://www.toufiktamasa.tech' });
        }
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);

  if (!info || hidden) return null;

  return (
    <View style={styles.root}>
      <Pressable
        style={styles.main}
        onPress={() => void Linking.openURL(info.url)}
        accessibilityRole='link'
        accessibilityLabel={`Update to version ${info.latest}`}
      >
        <Ionicons name='arrow-down-circle-outline' size={20} color={colors.accent.text} />
        <AppText variant='bodySmall'>Version {info.latest} is available. Tap to update.</AppText>
      </Pressable>
      <Pressable onPress={() => setHidden(true)} hitSlop={10} accessibilityRole='button' accessibilityLabel='Dismiss'>
        <Ionicons name='close' size={18} color={colors.text.muted} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
    backgroundColor: colors.surface.elevated,
  },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
