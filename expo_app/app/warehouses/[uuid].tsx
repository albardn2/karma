import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { ChartLegend, LineChart } from '@/components/Chart';
import { useLanguage } from '@/contexts/LanguageContext';
import { useHasModule } from '@/hooks/useModuleAccess';
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';

interface Warehouse {
  uuid: string;
  name: string;
  address?: string | null;
  notes?: string | null;
}

interface StockItem {
  material_uuid: string;
  material_name: string;
  sku?: string | null;
  unit?: string | null;
  quantity: number;
  lots: number;
  last_event_at?: string | null;
}

interface OverTimeSeries {
  material_uuid: string;
  material_name: string;
  unit?: string | null;
  baseline: number;
  buckets: Array<{ period: string; delta: number }>;
}

const RANGES = [
  { id: '30d', days: 30, bucket: 'day' },
  { id: '90d', days: 90, bucket: 'week' },
  { id: '12m', days: 365, bucket: 'month' },
] as const;

/** Naive ISO — the backend rejects a zone suffix outright with "Invalid date". */
const naiveIso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '');

const tick = (iso: string, bucket: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return bucket === 'month'
    ? `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`
    : `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * A warehouse, what is in it, and how that changed.
 *
 * The over-time endpoint returns a BASELINE plus per-bucket DELTAS, not stock
 * levels. Plotting the deltas directly would draw movements as if they were
 * quantities on hand, so the level is accumulated forward from the baseline here.
 *
 * Each material is its own series and they are never summed — the backend's own
 * docstring says the same thing for the same reason: units differ, so adding 40 kg
 * of sugar to 12 sacks yields a number that means nothing.
 */
export default function WarehousesDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { t } = useLanguage();
  const [stock, setStock] = useState<StockItem[] | null>(null);
  const [series, setSeries] = useState<OverTimeSeries[] | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('90d');
  const [bucket, setBucket] = useState<string>('week');
  const [reloadKey, setReloadKey] = useState(0);
  // adding stock is an inventory-module write even though it starts here
  const canAddStock = useHasModule('inventory');

  const loadAnalytics = useCallback(async () => {
    const preset = RANGES.find((r) => r.id === range)!;
    const from = new Date();
    from.setDate(from.getDate() - preset.days);

    const [stateRes, timeRes] = await Promise.all([
      apiCall<{ items: StockItem[] }>(
        `/inventory/analytics/warehouse-state?warehouse_uuid=${uuid}`,
      ),
      apiCall<{ bucket: string; series: OverTimeSeries[] }>(
        `/inventory/analytics/warehouse-over-time?warehouse_uuid=${uuid}` +
          `&bucket=${preset.bucket}&start_date=${encodeURIComponent(naiveIso(from))}`,
      ),
    ]);
    setStock(isOk(stateRes.status) ? (stateRes.data?.items ?? []) : []);
    if (isOk(timeRes.status)) {
      setSeries(timeRes.data?.series ?? []);
      setBucket(timeRes.data?.bucket ?? preset.bucket);
    } else {
      setSeries([]);
    }
  }, [uuid, range]);

  useEffect(() => {
    loadAnalytics();
    // reloadKey so stock and the chart reflect a lot added moments ago, not just the
    // warehouse record itself
  }, [loadAnalytics, reloadKey]);

  // The four biggest materials only: a phone-width chart with twenty series is a
  // smear, and the tail is where the uninteresting ones live.
  const charted = (series ?? [])
    .slice()
    .sort((a, b) => Math.abs(Number(b.baseline ?? 0)) - Math.abs(Number(a.baseline ?? 0)))
    .slice(0, 4)
    .map((s) => {
      let level = Number(s.baseline ?? 0);
      return {
        name: `${s.material_name}${s.unit ? ` (${s.unit})` : ''}`,
        points: (s.buckets ?? []).map((b) => {
          level += Number(b.delta ?? 0);
          return { label: tick(b.period, bucket), value: level };
        }),
      };
    })
    .filter((s) => s.points.length);

  const qty = (n: number) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));

  return (
    <ModuleDetailScreen<Warehouse>
      module="warehouses"
      title={t('menu.warehouses')}
      endpoint={`/warehouse/${uuid}`}
      reloadKey={reloadKey}
      heading={(x) => x.name}
      rows={(x): DetailRow[] => [
        [t('warehouses.address'), x.address || '—'],
        [t('warehouses.notes'), x.notes || '—'],
      ]}
      sections={[
        {
          title: t('warehouses.currentStock'),
          isEmpty: () => !stock?.length,
          emptyText: t('warehouses.noStock'),
          render: () => (
            <>
              {(stock ?? []).map((s) => (
                <View key={s.material_uuid} style={styles.stockRow}>
                  <View style={styles.stockLeft}>
                    <ThemedText style={styles.stockName} numberOfLines={1}>
                      {s.material_name}
                    </ThemedText>
                    <ThemedText style={styles.stockMeta}>
                      {t('warehouses.lots', { count: s.lots })}
                      {s.last_event_at ? ` · ${formatNumericDate(new Date(s.last_event_at))}` : ''}
                    </ThemedText>
                  </View>
                  <ThemedText
                    style={[styles.stockQty, Number(s.quantity) <= 0 && styles.stockQtyBad]}
                  >
                    {qty(Number(s.quantity))}
                    {s.unit ? ` ${s.unit}` : ''}
                  </ThemedText>
                </View>
              ))}
            </>
          ),
        },
        {
          title: t('warehouses.stockOverTime'),
          isEmpty: () => !charted.length,
          emptyText: t('warehouses.noMovements'),
          render: () => (
            <>
              <View style={styles.chips}>
                {RANGES.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.chip, range === r.id && styles.chipOn]}
                    onPress={() => setRange(r.id)}
                    testID={`wh-range-${r.id}`}
                  >
                    <ThemedText style={[styles.chipText, range === r.id && styles.chipTextOn]}>
                      {t(`expenses.range.${r.id}`)}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
              <LineChart series={charted} width={width - 72} step />
              <ChartLegend names={charted.map((c) => c.name)} />
              {(series ?? []).length > charted.length && (
                <ThemedText style={styles.more}>
                  {t('warehouses.topMaterials', { shown: charted.length })}
                </ThemedText>
              )}
            </>
          ),
        },
      ]}
      actions={[
        {
          label: t('detail.edit'),
          testID: 'warehouse-edit',
          onPress: (x) => {
            setReloadKey((k) => k + 1);
            router.push({
              pathname: '/warehouses/create',
              params: {
                uuid: x.uuid,
                name: x.name ?? '',
                address: x.address ?? '',
                notes: x.notes ?? '',
              },
            });
          },
        },
        ...(canAddStock
          ? [
              {
                label: t('inventory.addStock'),
                testID: 'warehouse-add-stock',
                onPress: (x: Warehouse) => {
                  setReloadKey((k) => k + 1);
                  router.push({
                    pathname: '/warehouses/add-stock',
                    params: { warehouse_uuid: x.uuid, warehouse_name: x.name ?? '' },
                  });
                },
              },
            ]
          : []),
      ]}
    />
  );
}

const styles = StyleSheet.create({
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  stockLeft: { flex: 1 },
  stockName: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  stockMeta: { fontSize: 11, opacity: 0.55, marginTop: 1 },
  stockQty: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  stockQtyBad: { color: '#991b1b' },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  // the trips filter-chip design — one look for every filter bar
  chip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipOn: { backgroundColor: '#5469D4' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#4B5563' },
  chipTextOn: { color: '#fff' },
  more: { fontSize: 11, opacity: 0.5, marginTop: 8 },
});
