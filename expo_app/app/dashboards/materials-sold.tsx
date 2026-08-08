import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { FilterChip, ScrollingChipRow } from '@/components/FilterChips';
import { StackedBarChart, ChartLegend } from '@/components/Chart';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

interface MaterialRow {
  material_uuid: string;
  name: string;
  unit: string;
  total: number;
  fulfilled: number;
  unfulfilled: number;
}
interface Payload {
  granularity: string;
  offset: number;
  period_label: string;
  period_start: string;
  materials: MaterialRow[];
  disclosure: { materials_omitted: number };
}

type Gran = 'day' | 'week' | 'month' | 'quarter' | 'year';

// fulfilled reads as green (delivered), unfulfilled as amber (still pending, not an
// error) — the web page uses the same pair
const FULFILLED = '#16a34a';
const UNFULFILLED = '#d97706';

const short = (s: string, n = 7) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Quantities of materials sold in ONE period — each bar is a MATERIAL, stacked
 * into fulfilled vs unfulfilled quantity.
 *
 * The x-axis is materials rather than time, so the granularity picks a window and
 * the ‹ › row steps it back and forth. Quantities are in each material's own unit;
 * the server groups by (material, unit) and never sums across materials. Bar labels
 * are truncated for phone width — the table below carries the full names.
 */
export default function MaterialsSoldScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useLanguage();

  const [gran, setGranRaw] = useState<Gran>('month');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  // switching granularity re-anchors to the current period — an offset of 3
  // months means nothing in weeks
  const setGran = (g: Gran) => {
    setGranRaw(g);
    setOffset(0);
  };

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      const res = await apiCall<Payload>(
        `/dashboard/materials-sold?granularity=${gran}&offset=${offset}`,
      );
      if (isOk(res.status) && res.data) setData(res.data);
      else setFailed(true);
      setLoading(false);
      setRefreshing(false);
    },
    [gran, offset],
  );

  useEffect(() => {
    load();
  }, [load]);

  const chartWidth = width - 72;
  const materials = data?.materials ?? [];
  const hasAny = materials.length > 0;
  const omitted = data?.disclosure.materials_omitted ?? 0;
  const names = [t('dashboards.fulfilled'), t('dashboards.unfulfilled')];

  const GRANS: Array<[Gran, string]> = [
    ['day', t('dashboards.gDay')],
    ['week', t('dashboards.gWeek')],
    ['month', t('dashboards.gMonth')],
    ['quarter', t('dashboards.gQuarter')],
    ['year', t('dashboards.gYear')],
  ];

  return (
    <ModuleGuard module="dashboard">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="ms-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle}>{t('dashboards.materialsSold')}</ThemedText>
          <View style={styles.backSpacer} />
        </View>

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
          <View style={styles.controls}>
            <ScrollingChipRow>
              {GRANS.map(([g, label]) => (
                <FilterChip key={g} label={label} active={gran === g} onPress={() => setGran(g)} testID={`ms-gran-${g}`} />
              ))}
            </ScrollingChipRow>

            {/* period navigator: ‹ steps back one period, › returns toward now */}
            <View style={styles.periodRow}>
              <TouchableOpacity
                style={styles.periodBtn}
                onPress={() => setOffset(offset + 1)}
                hitSlop={8}
                testID="ms-prev"
              >
                <ThemedText style={styles.periodBtnText}>‹</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.periodLabel} testID="ms-period">
                {data?.period_label ?? '…'}
              </ThemedText>
              <TouchableOpacity
                style={[styles.periodBtn, offset === 0 && styles.periodBtnOff]}
                onPress={() => setOffset(Math.max(0, offset - 1))}
                disabled={offset === 0}
                hitSlop={8}
                testID="ms-next"
              >
                <ThemedText style={styles.periodBtnText}>›</ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <View style={styles.centre}>
              <ActivityIndicator size="large" color="#5469D4" />
            </View>
          ) : failed ? (
            <View style={styles.centre}>
              <ThemedText style={styles.stateText}>{t('moduleList.failed')}</ThemedText>
              <TouchableOpacity style={styles.retry} onPress={() => load()}>
                <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
              </TouchableOpacity>
            </View>
          ) : !hasAny ? (
            <View style={styles.centre}>
              <ThemedText style={styles.stateText}>{t('dashboards.noData')}</ThemedText>
            </View>
          ) : (
            <>
              <View style={styles.panel}>
                <StackedBarChart
                  width={chartWidth}
                  colours={[FULFILLED, UNFULFILLED]}
                  series={names}
                  data={materials.map((m) => ({
                    label: short(m.name),
                    segments: [m.fulfilled, m.unfulfilled],
                  }))}
                />
                <ChartLegend names={names} colours={[FULFILLED, UNFULFILLED]} />
              </View>

              <ThemedText style={styles.defn}>{t('dashboards.materialUnitsNote')}</ThemedText>
              {omitted > 0 && (
                <ThemedText style={styles.caveat}>
                  {t('dashboards.materialsOmitted', { count: String(omitted) })}
                </ThemedText>
              )}

              {/* full names + the numbers, biggest first (server order) */}
              <View style={styles.table}>
                <View style={styles.row}>
                  <ThemedText style={[styles.rowLabel, styles.head]} />
                  <View style={styles.rowVals}>
                    <ThemedText style={[styles.rowVal, styles.head]}>{t('dashboards.total')}</ThemedText>
                    <ThemedText style={[styles.rowVal, styles.head]}>{t('dashboards.fulfilled')}</ThemedText>
                    <ThemedText style={[styles.rowVal, styles.head]}>{t('dashboards.unfulfilled')}</ThemedText>
                  </View>
                </View>
                {materials.map((m) => (
                  <View key={`${m.material_uuid}-${m.unit}`} style={styles.row}>
                    <ThemedText style={styles.rowLabel} numberOfLines={2}>
                      {m.name}
                      <ThemedText style={styles.unitText}> ({m.unit})</ThemedText>
                    </ThemedText>
                    <View style={styles.rowVals}>
                      <ThemedText style={styles.rowVal}>{m.total}</ThemedText>
                      <ThemedText style={[styles.rowVal, { color: FULFILLED }]}>{m.fulfilled}</ThemedText>
                      <ThemedText style={[styles.rowVal, m.unfulfilled > 0 && { color: UNFULFILLED }]}>
                        {m.unfulfilled}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
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
  controls: { gap: 10, marginBottom: 14 },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  periodBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodBtnOff: { opacity: 0.35 },
  periodBtnText: { fontSize: 20, lineHeight: 22, color: '#5469D4', fontWeight: '700' },
  periodLabel: { fontSize: 14, fontWeight: '700', color: '#111827', minWidth: 92, textAlign: 'center' },
  panel: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  defn: { fontSize: 11, color: '#6B7280', lineHeight: 16, marginTop: 8 },
  caveat: { fontSize: 12, color: '#B45309', lineHeight: 17, marginTop: 8 },
  table: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 10 },
  rowLabel: { flexBasis: 120, flexShrink: 0, fontSize: 12, fontWeight: '700', color: '#111827', lineHeight: 15 },
  unitText: { fontSize: 10, fontWeight: '400', color: '#9ca3af' },
  rowVals: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  rowVal: { fontSize: 12, color: '#374151', fontVariant: ['tabular-nums'] },
  head: { color: '#9ca3af', fontWeight: '700', fontSize: 10 },
  centre: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  retry: { backgroundColor: '#5469D4', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '600' },
});
