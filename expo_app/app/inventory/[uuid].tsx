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
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';

interface InventoryLot {
  uuid: string;
  lot_id: string;
  material_name?: string | null;
  unit?: string | null;
  current_quantity: number;
  original_quantity: number;
  expiration_date?: string | null;
  is_active: boolean;
  notes?: string | null;
  created_at: string;
  warehouse_uuid?: string | null;
  cost_per_unit?: number | null;
  total_original_cost?: number | null;
  cost_currency?: string | null;
}

/**
 * One lot.
 *
 * The warehouse name is fetched separately because the inventory row carries only
 * warehouse_uuid, and "which warehouse" is the first thing a keeper asks about a
 * lot — a uuid on screen would make them go and look it up. It is a best-effort
 * second request: if it fails the lot still renders, since the lot is the point
 * and the name is context.
 */
export default function InventoryLotScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [lot, setLot] = useState<InventoryLot | null>(null);
  const [warehouse, setWarehouse] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      try {
        const res = await apiCall<InventoryLot>(`/inventory/${uuid}`);
        if (isOk(res.status) && res.data) {
          setLot(res.data);
          if (res.data.warehouse_uuid) {
            const w = await apiCall<any>(`/warehouse/${res.data.warehouse_uuid}`);
            setWarehouse(isOk(w.status) ? (w.data?.name ?? null) : null);
          }
        } else {
          setFailed(true);
        }
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

  const qty = (n?: number | null) =>
    n == null ? '—' : Number.isInteger(n) ? String(n) : Number(n).toFixed(2);
  const money = (n?: number | null) =>
    n == null ? '—' : `${Number(n).toFixed(2)}${lot?.cost_currency ? ` ${lot.cost_currency}` : ''}`;

  const rows: Array<[string, string]> = lot
    ? [
        [t('inventory.warehouse'), warehouse ?? '—'],
        [t('inventory.lotId'), lot.lot_id],
        [t('inventory.current'), `${qty(lot.current_quantity)}${lot.unit ? ` ${lot.unit}` : ''}`],
        [t('inventory.original'), `${qty(lot.original_quantity)}${lot.unit ? ` ${lot.unit}` : ''}`],
        [t('inventory.costPerUnit'), money(lot.cost_per_unit)],
        [t('inventory.totalCost'), money(lot.total_original_cost)],
        [
          t('inventory.expiry'),
          lot.expiration_date ? formatNumericDate(new Date(lot.expiration_date)) : '—',
        ],
        [t('inventory.received'), formatNumericDate(new Date(lot.created_at))],
      ]
    : [];

  return (
    <ModuleGuard module="inventory">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} testID="lot-back" hitSlop={12}>
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('menu.inventory')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        {loading ? (
          <View style={styles.centre}>
            <ActivityIndicator size="large" color="#5469D4" />
          </View>
        ) : failed || !lot ? (
          <View style={styles.centre}>
            <ThemedText style={styles.stateIcon}>⚠️</ThemedText>
            <ThemedText style={styles.stateText} testID="lot-error">
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
            <ThemedText style={styles.material} testID="lot-material">
              {lot.material_name || t('inventory.unknownMaterial')}
            </ThemedText>
            {!lot.is_active && (
              <ThemedText style={styles.inactiveNote}>{t('inventory.inactiveNote')}</ThemedText>
            )}

            <View style={styles.card}>
              {rows.map(([label, value]) => (
                <View key={label} style={styles.row}>
                  <ThemedText style={styles.rowLabel}>{label}</ThemedText>
                  <ThemedText style={styles.rowValue}>{value}</ThemedText>
                </View>
              ))}
            </View>

            {!!lot.notes && (
              <>
                <ThemedText style={styles.sectionTitle}>{t('inventory.notes')}</ThemedText>
                <View style={styles.card}>
                  <ThemedText style={styles.notes}>{lot.notes}</ThemedText>
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
  material: { fontSize: 22, fontWeight: '700', color: '#1f2937' },
  inactiveNote: { fontSize: 13, color: '#92400e', marginTop: 6 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { flex: 1, fontSize: 14, opacity: 0.65 },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 22, marginBottom: -6 },
  notes: { fontSize: 14, lineHeight: 20, opacity: 0.8 },
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
