import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryChip } from '@/components/ui/CategoryChip';
import { GlassIconButton } from '@/components/ui/GlassIconButton';
import { SearchBar } from '@/components/ui/SearchBar';
import { colors, layout, spacing } from '@/css';
import { SearchResults } from '@/features/search/SearchResults';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useGoBack } from '@/lib/navigation/useGoBack';
import type { SearchScope } from '@/types/search';

const TABS: Array<{ scope: SearchScope; label: string }> = [
  { scope: 'all', label: 'All' },
  { scope: 'videos', label: 'Videos' },
  { scope: 'creators', label: 'Creators' },
  { scope: 'topics', label: 'Topics' },
];

const SearchScreen = () => {
  const insets = useSafeAreaInsets();
  const goBack = useGoBack();
  const [text, setText] = useState('');
  const [scope, setScope] = useState<SearchScope>('all');

  const trimmed = text.trim();
  const debounced = useDebouncedValue(trimmed, 350);
  // Clearing the box resets immediately; typing waits for the debounce so we don't fire per keystroke.
  const q = trimmed ? debounced : '';

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + spacing.sm }]}>
        <GlassIconButton icon='chevron-back' label='Go back' onPress={goBack} />
        <View style={styles.bar}>
          <SearchBar
            value={text}
            onChangeText={setText}
            placeholder='Search videos, creators, topics'
            autoFocus
          />
        </View>
      </View>

      {q ? (
        <View style={styles.tabs}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabsContent}
            keyboardShouldPersistTaps='handled'
          >
            {TABS.map((tab) => (
              <CategoryChip
                key={tab.scope}
                label={tab.label}
                selected={scope === tab.scope}
                onPress={() => setScope(tab.scope)}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <SearchResults q={q} scope={scope} onScope={setScope} />
    </View>
  );
};

export default SearchScreen;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background.primary },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: layout.screenPadding,
  },
  bar: { flex: 1 },
  tabs: { paddingTop: spacing.md },
  tabsContent: { paddingHorizontal: layout.screenPadding, gap: spacing.sm },
});
