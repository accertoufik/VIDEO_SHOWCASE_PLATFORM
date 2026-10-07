import type { ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, layout } from '@/css';
import { useDockInset } from '@/components/navigation/useDockInset';

type Props = {
  children?: ReactNode;
  /** Wrap in a ScrollView. For long lists use FlatList yourself and call useDockInset(). */
  scroll?: boolean;
  /** Pad the top by the status-bar/notch height. Off for screens with a full-bleed header/video. */
  safeTop?: boolean;
  /** Reserve space for the floating dock at the bottom. On for tab screens. */
  dock?: boolean;
  /** Horizontal screen padding token. */
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

// Every screen's root. Background, safe areas and dock clearance come from here, not from each screen.
export const Screen = ({
  children,
  scroll,
  safeTop = true,
  dock = false,
  padded = true,
  style,
  contentContainerStyle,
}: Props) => {
  const insets = useSafeAreaInsets();
  const dockInset = useDockInset();
  const spacingStyle: ViewStyle = {
    paddingTop: safeTop ? insets.top : 0,
    paddingBottom: dock ? dockInset : insets.bottom,
    paddingHorizontal: padded ? layout.screenPadding : 0,
  };

  if (scroll) {
    return (
      <ScrollView
        style={[styles.root, style]}
        contentContainerStyle={[spacingStyle, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps='handled'
      >
        {children}
      </ScrollView>
    );
  }

  return <View style={[styles.root, spacingStyle, style]}>{children}</View>;
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
});
