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
import { StackedBarChart, ChartLegend, SERIES_COLOURS } from '@/components/Chart';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

interface Group {
  period_label: string;
  period_start: string;
  total: number;
  breakdown: Record<string, number>;
}
interface Payload {
  granularity: string;
  users: string[];
  groups: Group[];
  disclosure: { users_grouped: number };
}

type Gran = 'day' | 'week' | 'month' | 'quarter' | 'year';

// reserved segment keys from the server; unassigned always draws neutral gray
const UNASSIGNED = '__unassigned__';
const OTHERS = '__others__';
const UNASSIGNED_COLOUR = '#9ca3af';

/**
 * Trip-stop counts per period as a stacked bar, one colour per assigned user.
 *
 * The server attributes each stop to its trip's assignee (the same "Assigned To"
 * the trips screens show), folds users beyond the top 8 into "__others__" so bars
 * keep their true height, and puts stops of unassigned trips into "__unassigned__"
 * (gray). Counts, not money — the one control here is granularity.
 */
export default function TripStopsScreen() {
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
      const res = await apiCall<Payload>(`/dashboard/trip-stops?granularity=${gran}`);
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
  const users = data?.users ?? [];
  const groups = data?.groups ?? [];
  const hasAny = groups.some((g) => g.total !== 0);
  const label = (key: string) =>
    key === UNASSIGNED
      ? t('dashboards.unassigned')
      : key === OTHERS
        ? t('dashboards.othersSeg')
        : key;
  const colours = users.map((u, i) =>
    u === UNASSIGNED ? UNASSIGNED_COLOUR : SERIES_COLOURS[i % SERIES_COLOURS.length],
  );
  const names = users.map(label);

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
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="ts-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle}>{t('dashboards.tripStops')}</ThemedText>
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
              {GRANS.map(([g, l]) => (
                <FilterChip key={g} label={l} active={gran === g} onPress={() => setGran(g)} testID={`ts-gran-${g}`} />
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
                  colours={colours}
                  series={names}
                  data={groups.map((g) => ({
                    label: g.period_label,
                    segments: users.map((u) => g.breakdown[u] ?? 0),
                  }))}
                />
                <ChartLegend names={names} colours={colours} />
              </View>

              {/* the attribution rule, spelled out */}
              <ThemedText style={styles.defn}>{t('dashboards.tripStopsNote')}</ThemedText>

              {/* per-period totals + per-user breakdown, newest first */}
              <View style={styles.table}>
                {[...groups].reverse().filter((g) => g.total !== 0).map((g) => (
                  <View key={g.period_start} style={styles.block}>
                    <View style={styles.row}>
                      <ThemedText style={styles.period}>{g.period_label}</ThemedText>
                      <ThemedText style={styles.total}>{g.total}</ThemedText>
                    </View>
                    {users
                      .filter((u) => (g.breakdown[u] ?? 0) !== 0)
                      .map((u) => (
                        <View key={u} style={styles.subRow}>
                          <View style={styles.legendRow}>
                            <View
                              style={[styles.swatch, { backgroundColor: colours[users.indexOf(u)] }]}
                            />
                            <ThemedText style={styles.subLabel}>{label(u)}</ThemedText>
                          </View>
                          <ThemedText style={styles.subVal}>{g.breakdown[u]}</ThemedText>
                        </View>
                      ))}
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
  defn: { fontSize: 11, color: '#6B7280', lineHeight: 16, marginTop: 8 },
  table: { marginTop: 16, gap: 10 },
  block: { backgroundColor: '#fff', borderRadius: 12, padding: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  period: { fontSize: 14, fontWeight: '700', color: '#111827' },
  total: { fontSize: 14, fontWeight: '700', color: '#111827', fontVariant: ['tabular-nums'] },
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatch: { width: 9, height: 9, borderRadius: 2 },
  subLabel: { fontSize: 12, color: '#4B5563' },
  subVal: { fontSize: 12, color: '#374151', fontVariant: ['tabular-nums'] },
  centre: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  retry: { backgroundColor: '#5469D4', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '600' },
});
