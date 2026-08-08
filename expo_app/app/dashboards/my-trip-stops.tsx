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

interface Group {
  period_label: string;
  period_start: string;
  total: number;
  completed: number;
  not_completed: number;
}
interface Payload {
  granularity: string;
  groups: Group[];
}

type Gran = 'day' | 'week' | 'month' | 'quarter' | 'year';

// completed reads as green (done), the rest amber (still open, not an error) —
// the same pair the materials dashboard uses for fulfilled/unfulfilled
const COMPLETED = '#16a34a';
const NOT_COMPLETED = '#d97706';

/**
 * The signed-in user's own trip stops per period: completed vs not.
 *
 * The server counts stops on trips ASSIGNED to the caller (the trips module's
 * own "Assigned To" resolution) and splits by stop status — with one user the
 * global dashboard's per-user split is meaningless, so status is the honest
 * breakdown. Self-scoped endpoint: a driver may see their own numbers.
 */
export default function MyTripStopsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useLanguage();

  const [gran, setGran] = useState<Gran>('month');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      const res = await apiCall<Payload>(`/dashboard/my-trip-stops?granularity=${gran}`);
      if (isOk(res.status) && res.data) setData(res.data);
      else setFailed(true);
      setLoading(false);
      setRefreshing(false);
    },
    [gran],
  );

  useEffect(() => {
    load();
  }, [load]);

  const chartWidth = width - 72;
  const groups = data?.groups ?? [];
  const hasAny = groups.some((g) => g.total !== 0);
  const names = [t('dashboards.completed'), t('dashboards.notCompleted')];

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
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="mts-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle}>{t('dashboards.myTripStops')}</ThemedText>
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
                <FilterChip key={g} label={label} active={gran === g} onPress={() => setGran(g)} testID={`mts-gran-${g}`} />
              ))}
            </ScrollingChipRow>
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
                  colours={[COMPLETED, NOT_COMPLETED]}
                  series={names}
                  data={groups.map((g) => ({
                    label: g.period_label,
                    segments: [g.completed, g.not_completed],
                  }))}
                />
                <ChartLegend names={names} colours={[COMPLETED, NOT_COMPLETED]} />
              </View>

              {/* the numbers behind the bars, newest first */}
              <View style={styles.table}>
                <View style={styles.row}>
                  <ThemedText style={[styles.rowLabel, styles.head]} />
                  <View style={styles.rowVals}>
                    <ThemedText style={[styles.rowVal, styles.head]}>{t('dashboards.total')}</ThemedText>
                    <ThemedText style={[styles.rowVal, styles.head]}>{t('dashboards.completed')}</ThemedText>
                    <ThemedText style={[styles.rowVal, styles.head]}>{t('dashboards.notCompleted')}</ThemedText>
                  </View>
                </View>
                {[...groups].reverse().map((g) => (
                  <View key={g.period_start} style={styles.row}>
                    <ThemedText style={styles.rowLabel}>{g.period_label}</ThemedText>
                    <View style={styles.rowVals}>
                      <ThemedText style={styles.rowVal}>{g.total}</ThemedText>
                      <ThemedText style={[styles.rowVal, { color: COMPLETED }]}>{g.completed}</ThemedText>
                      <ThemedText style={[styles.rowVal, g.not_completed > 0 && { color: NOT_COMPLETED }]}>
                        {g.not_completed}
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
  panel: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  table: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 10 },
  rowLabel: { width: 74, fontSize: 12, fontWeight: '700', color: '#111827' },
  rowVals: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  rowVal: { fontSize: 12, color: '#374151', fontVariant: ['tabular-nums'] },
  head: { color: '#9ca3af', fontWeight: '700', fontSize: 10 },
  centre: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  retry: { backgroundColor: '#5469D4', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '600' },
});
