import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';

interface Material {
  uuid: string;
  name: string;
  sku?: string | null;
  measure_unit?: string | null;
  type?: string | null;
  description?: string | null;
  created_at: string;
}

export default function MaterialDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, tef } = useLanguage();
  const [material, setMaterial] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      try {
        const res = await apiCall<Material>(`/material/${uuid}`);
        if (res.status === 200 && res.data) setMaterial(res.data);
        else setFailed(true);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [uuid],
  );

  useEffect(() => {
    load();
  }, [load]);

  const rows: Array<[string, string]> = material
    ? [
        [t('materials.sku'), material.sku || '—'],
        [t('materials.unit'), material.measure_unit || '—'],
        [t('materials.type'), material.type ? tef(material.type) : '—'],
        [t('materials.created'), formatNumericDate(new Date(material.created_at))],
      ]
    : [];

  return (
    <ModuleGuard module="materials">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} testID="material-back" hitSlop={12}>
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('menu.materials')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        {loading ? (
          <View style={styles.centre}>
            <ActivityIndicator size="large" color="#5469D4" />
          </View>
        ) : failed || !material ? (
          <View style={styles.centre}>
            <ThemedText style={styles.stateIcon}>⚠️</ThemedText>
            <ThemedText style={styles.stateText} testID="material-error">
              {t('moduleList.failed')}
            </ThemedText>
            <TouchableOpacity style={styles.retry} onPress={() => load()}>
              <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: 40 + insets.bottom }]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load(true);
                }}
              />
            }
          >
            <ThemedText style={styles.name} testID="material-name">
              {material.name}
            </ThemedText>

            <View style={styles.card}>
              {rows.map(([label, value]) => (
                <View key={label} style={styles.row}>
                  <ThemedText style={styles.rowLabel}>{label}</ThemedText>
                  <ThemedText style={styles.rowValue}>{value}</ThemedText>
                </View>
              ))}
            </View>

            {!!material.description && (
              <>
                <ThemedText style={styles.sectionTitle}>
                  {t('materials.description')}
                </ThemedText>
                <View style={styles.card}>
                  <ThemedText style={styles.description}>{material.description}</ThemedText>
                </View>
              </>
            )}
          </ScrollView>
        )}
      </ThemedView>
    </ModuleGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 20, paddingTop: 6 },
  name: { fontSize: 22, fontWeight: '700', color: '#1f2937' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { flex: 1, fontSize: 14, opacity: 0.65 },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 22, marginBottom: -6 },
  description: { fontSize: 14, lineHeight: 20, opacity: 0.8 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateIcon: { fontSize: 34 },
  stateText: { fontSize: 15, opacity: 0.6, textAlign: 'center' },
  retry: {
    marginTop: 6,
    backgroundColor: '#5469D4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
