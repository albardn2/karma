import React, { useRef, useState } from 'react';
import {
  I18nManager,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';

/**
 * The app's one filter-chip design, lifted from the trips screen — grey resting
 * fill, 16pt radius, indigo when lit — so every module's filter bar reads as the
 * same control. Before this, trips had this design, the list scaffold had white
 * full-round pills, and two analytics screens had a third variant; same job,
 * three looks.
 *
 * trips.tsx keeps its own local copy of both pieces deliberately: it is a
 * confirmed-good module that this refactor must not touch, and its chips carry
 * extra behaviour (two filter dimensions with a divider between them). The
 * design here matches it by construction; if the look ever changes, change both.
 */
export function FilterChip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      testID={testID}
    >
      <ThemedText style={[styles.chipText, active && styles.chipTextActive]}>{label}</ThemedText>
    </TouchableOpacity>
  );
}

/**
 * One row of chips that scrolls sideways instead of wrapping.
 *
 * Chips do not reliably fit a phone's width — wrapping leaves one orphaned on a
 * line of its own, and the Arabic labels are a different width again, so no
 * amount of shortening fixes it for good. The arrow appears only while there is
 * something further along and taps to scroll, so the overflow is not left to be
 * discovered by swiping.
 */
export function ScrollingChipRow({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<ScrollView>(null);
  const geometry = useRef({ content: 0, viewport: 0, offset: 0 });
  const [hasMore, setHasMore] = useState(false);

  const recompute = () => {
    const { content, viewport, offset } = geometry.current;
    setHasMore(content - viewport - offset > 8);
  };

  return (
    <View style={styles.row}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        onContentSizeChange={(w) => {
          geometry.current.content = w;
          recompute();
        }}
        onLayout={(e) => {
          geometry.current.viewport = e.nativeEvent.layout.width;
          recompute();
        }}
        onScroll={(e) => {
          geometry.current.offset = e.nativeEvent.contentOffset.x;
          recompute();
        }}
        scrollEventThrottle={32}
      >
        {children}
      </ScrollView>
      {hasMore && (
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => {
            const { viewport, offset } = geometry.current;
            scrollRef.current?.scrollTo({ x: offset + viewport * 0.7, animated: true });
          }}
          testID="chip-row-more"
        >
          {/* points the way reading goes, so it flips with the layout */}
          <ThemedText style={styles.moreArrow}>{I18nManager.isRTL ? '‹' : '›'}</ThemedText>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  scroll: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  chip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipActive: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#4B5563' },
  chipTextActive: { color: '#fff' },
  moreButton: { paddingHorizontal: 12, paddingVertical: 4 },
  moreArrow: { fontSize: 22, fontWeight: '700', color: '#5469D4', lineHeight: 24 },
});
