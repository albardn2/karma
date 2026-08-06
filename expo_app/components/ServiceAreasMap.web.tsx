import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Web fallback for the all-areas map.
 *
 * `react-native-maps` re-exports react-native-web's UnimplementedView, so the real
 * component would render its footer around an empty grey rectangle. Same reasoning as
 * the three map fallbacks already in this directory.
 *
 * The LIST tab still works in the browser build — the row thumbnails are SVG, not maps —
 * so this degrades to "one of the two views is unavailable" rather than a dead screen.
 */
export function ServiceAreasMap() {
  const { t } = useLanguage();
  return (
    <View style={styles.centre}>
      <ThemedText style={styles.text}>{t('serviceAreas.webUnsupported')}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  text: { fontSize: 14, lineHeight: 21, color: '#6B7280', textAlign: 'center' },
});
