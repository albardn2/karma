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

interface InventoryEvent {
  uuid: string;
  event_type?: string | null;
  material_name?: string | null;
  quantity: number;
  created_at: string;
  notes?: string | null;
  cost_per_unit?: number | null;
  currency?: string | null;
  inventory_uuid?: string | null;
}

export default function InventoryEventDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, tef } = useLanguage();
  const [event, setEvent] = useState<InventoryEvent | null>(null);
  const [lot, setLot] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      try {
        const res = await apiCall<InventoryEvent>(`/inventory-event/${uuid}`);
        if (isOk(res.status) && res.data) {
          setEvent(res.data);
          if (res.data.inventory_uuid) {
            // the lot this moved, so the event can be traced back to stock
            const inv = await apiCall<any>(`/inventory/${res.data.inventory_uuid}`);
            setLot(isOk(inv.status) ? (inv.data?.lot_id ?? null) : null);
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

  const out = Number(event?.quantity ?? 0) < 0;

  const rows: Array<[string, string]> = event
    ? [
        [t('inventoryEvents.type'), event.event_type ? tef(event.event_type) : '—'],
        [t('inventory.lotId'), lot ?? '—'],
        [
          t('inventoryEvents.costPerUnit'),
          event.cost_per_unit == null
            ? '—'
            : `${Number(event.cost_per_unit).toFixed(2)}${event.currency ? ` ${event.currency}` : ''}`,
        ],
        [t('inventoryEvents.when'), formatNumericDate(new Date(event.created_at))],
      ]
    : [];

  return (
    <ModuleGuard module="inventory-events">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} testID="event-back" hitSlop={12}>
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('menu.inventoryEvents')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        {loading ? (
          <View style={styles.centre}>
            <ActivityIndicator size="large" color="#5469D4" />
          </View>
        ) : failed || !event ? (
          <View style={styles.centre}>
            <ThemedText style={styles.stateIcon}>⚠️</ThemedText>
            <ThemedText style={styles.stateText} testID="event-error">
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
            <ThemedText style={styles.material}>
              {event.material_name || t('inventory.unknownMaterial')}
            </ThemedText>
            <ThemedText
              style={[styles.qty, out ? styles.qtyOut : styles.qtyIn]}
              testID="event-quantity"
            >
              {out ? '' : '+'}
              {Number(event.quantity ?? 0)}
            </ThemedText>

            <View style={styles.card}>
              {rows.map(([label, value]) => (
                <View key={label} style={styles.row}>
                  <ThemedText style={styles.rowLabel}>{label}</ThemedText>
                  <ThemedText style={styles.rowValue}>{value}</ThemedText>
                </View>
              ))}
            </View>

            {!!event.notes && (
              <>
                <ThemedText style={styles.sectionTitle}>{t('inventory.notes')}</ThemedText>
                <View style={styles.card}>
                  <ThemedText style={styles.notes}>{event.notes}</ThemedText>
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
  material: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: '#1f2937' },
  // explicit lineHeight: a large glyph is clipped without it
  qty: { fontSize: 30, lineHeight: 38, fontWeight: '700', marginTop: 4 },
  qtyIn: { color: '#166534' },
  qtyOut: { color: '#991b1b' },
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
