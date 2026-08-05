import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Web stub for the all-areas map. See create.web.tsx — react-native-maps renders
 * nothing on web, and a screen whose entire content is a map has nothing to degrade to.
 */
export default function ServiceAreasMapWebScreen() {
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="sa-map-back">
          <ThemedText style={styles.back}>‹</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.topTitle}>{t('serviceAreas.mapView')}</ThemedText>
        <View style={styles.backSpacer} />
      </View>
      <View style={styles.body}>
        <ThemedText style={styles.text}>{t('serviceAreas.webUnsupported')}</ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  body: { padding: 24 },
  text: { fontSize: 14, lineHeight: 21, opacity: 0.75 },
});
