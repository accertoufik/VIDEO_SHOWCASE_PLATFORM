import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { haptics } from '@/lib/haptics';
import { useRouter, usePathname, type Href } from 'expo-router';
import { useEffect, useState, type ComponentProps } from 'react';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PressableScale } from '@/components/ui/PressableScale';
import { AppText } from '@/components/ui/Text';
import { colors, layout, radii, shadows, spacing } from '@/css';
import { useCreateDestination } from '@/lib/auth/useCreateDestination';
import { homeTap } from '@/lib/navigation/homeTap';

type IconName = ComponentProps<typeof Ionicons>['name'];

type DockItem = { key: string; href: Href; label: string; icon: IconName; iconActive: IconName };

// Five equal slots: Home | Shorts | (+) | Downloads | Profile. The "+" is the middle slot, not a tab.
const items: Array<DockItem | 'create'> = [
  { key: 'home', href: '/', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { key: 'shorts', href: '/shorts', label: 'Shorts', icon: 'flash-outline', iconActive: 'flash' },
  'create',
  { key: 'downloads', href: '/downloads', label: 'Downloads', icon: 'download-outline', iconActive: 'download' },
  { key: 'profile', href: '/profile', label: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

const SLOT_COUNT = items.length;
const CAPSULE_INSET = 4;
const SPRING = { damping: 18, stiffness: 220, mass: 0.8 } as const;

/**
 * Floating pill dock (Telegram-style): a rounded glass bar hovering above the safe area, with one soft capsule that
 * glides to whichever tab is active, and the "+" in the middle slot, sitting inside the bar. Drawn once by the root layout.
 */
export const GlassDock = () => {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const create = useCreateDestination();
  const [barWidth, setBarWidth] = useState(0);

  const activeIndex = items.findIndex((item) => item !== 'create' && pathname === item.href);
  const slot = barWidth / SLOT_COUNT;

  const x = useSharedValue(0);
  const visible = useSharedValue(0);
  useEffect(() => {
    if (slot <= 0) return;
    if (activeIndex < 0) {
      visible.value = withSpring(0, SPRING);
      return;
    }
    // First time: appear in place instead of sliding in from the left edge.
    if (visible.value === 0) x.value = activeIndex * slot + CAPSULE_INSET;
    else x.value = withSpring(activeIndex * slot + CAPSULE_INSET, SPRING);
    visible.value = withSpring(1, SPRING);
  }, [activeIndex, slot, x, visible]);

  const capsuleStyle = useAnimatedStyle(() => ({
    opacity: visible.value,
    transform: [{ translateX: x.value }, { scaleX: 0.9 + 0.1 * visible.value }],
  }));

  const onLayout = (e: LayoutChangeEvent) => setBarWidth(e.nativeEvent.layout.width);

  const renderTab = (item: DockItem) => {
    const focused = pathname === item.href;
    return (
      <PressableScale
        key={item.key}
        accessibilityRole='tab'
        accessibilityLabel={item.label}
        accessibilityState={{ selected: focused }}
        onPress={() => {
          // Home always means "everything": drop any category filter and go back to the top, even when
          // the Home screen is already showing.
          if (item.key === 'home') homeTap.emit();
          if (focused) return;
          haptics.tap();
          router.navigate(item.href);
        }}
        style={styles.slot}
        scaleTo={0.92}
      >
        <Ionicons
          name={focused ? item.iconActive : item.icon}
          size={22}
          color={focused ? colors.text.primary : colors.icon.muted}
        />
        <AppText variant='nav' color={focused ? 'primary' : 'muted'} numberOfLines={1}>
          {item.label}
        </AppText>
      </PressableScale>
    );
  };

  return (
    <View
      pointerEvents='box-none'
      style={[
        styles.wrap,
        { bottom: insets.bottom + layout.dock.bottomOffset, left: layout.dock.horizontalMargin, right: layout.dock.horizontalMargin },
      ]}
    >
      <View style={styles.dock} accessibilityRole='tablist'>
        {/* The glass is its own clipped layer (rounded corners + blur). */}
        <View style={styles.glass} pointerEvents='none'>
          {Platform.OS === 'android' ? null : <BlurView intensity={90} tint='dark' style={StyleSheet.absoluteFill} />}
          <View style={[StyleSheet.absoluteFill, styles.fill]} />
        </View>

        <View style={styles.row} onLayout={onLayout}>
          {slot > 0 ? (
            <Animated.View
              pointerEvents='none'
              style={[styles.capsule, { width: slot - CAPSULE_INSET * 2 }, capsuleStyle]}
            />
          ) : null}
          {items.map((item) =>
            item === 'create' ? (
              <View key='create' style={styles.slot}>
                <PressableScale
                  accessibilityLabel='Create'
                  accessibilityHint='Open the create menu'
                  onPress={() => {
                    haptics.tap();
                    router.push(create.href);
                  }}
                  style={styles.create}
                >
                  <Ionicons name='add' size={32} color={colors.text.inverse} />
                </PressableScale>
              </View>
            ) : (
              renderTab(item)
            ),
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center' },
  dock: { width: '100%', maxWidth: layout.maxContentWidth, height: layout.dock.height, ...shadows.lg },
  glass: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radii.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.surface.border,
  },
  fill: { backgroundColor: colors.overlay.dock },
  row: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  slot: { flex: 1, height: '100%', alignItems: 'center', justifyContent: 'center', gap: 2 },
  capsule: {
    position: 'absolute',
    left: 0,
    top: CAPSULE_INSET + 2,
    bottom: CAPSULE_INSET + 2,
    borderRadius: radii.pill,
    backgroundColor: colors.accent.primarySoft,
  },
  create: {
    width: layout.dock.createButtonSize,
    height: layout.dock.createButtonSize,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.primary,
    borderWidth: 3,
    borderColor: colors.background.primary,
    ...shadows.glow,
  },
});
