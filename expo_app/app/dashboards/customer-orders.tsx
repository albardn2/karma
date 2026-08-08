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
  new_customer_orders: number;
  repeat_customer_orders: number;
}
interface Payload {
  granularity: string;
  groups: Group[];
}

type Gran = 'day' | 'week' | 'month' | 'quarter' | 'year';

// new customers read as green (growth), returning as the brand blue (retention) —
// the web page uses the same pair so a segment means the same thing in both clients
const NEW = '#16a34a';
const REPEAT = '#5469D4';

/**
 * Customer order counts per period as a stacked bar: new vs returning customers.
 *
 * The server does the classification, against each customer's first-ever order AT
 * THE CHART'S OWN GRANULARITY: an order is "new" when it falls in the customer's
 * first period, so a repeat purchase inside that same period still counts as new,
 * and the same customer reads as new in July and returning in August on a monthly
 * chart — while a yearly chart counts their whole first year as new. Counts, not
 * money, so this is the one dashboard without a currency toggle.
 */
export default function CustomerOrdersScreen() {
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
      const res = await apiCall<Payload>(`/dashboard/customer-orders?granularity=${gran}`);
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
  const names = [t('dashboards.newCustomers'), t('dashboards.repeatCustomers')];

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
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="co-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle}>{t('dashboards.customerOrders')}</ThemedText>
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
                <FilterChip key={g} label={label} active={gran === g} onPress={() => setGran(g)} testID={`co-gran-${g}`} />
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
                  colours={[NEW, REPEAT]}
                  series={names}
                  data={groups.map((g) => ({
                    label: g.period_label,
                    segments: [g.new_customer_orders, g.repeat_customer_orders],
                  }))}
                />
                <ChartLegend names={names} colours={[NEW, REPEAT]} />
              </View>

              {/* what "new" means here, spelled out — the rule is subtle */}
              <ThemedText style={styles.defn}>{t('dashboards.newRepeatNote')}</ThemedText>

              {/* the numbers behind the bars, newest first */}
              <View style={styles.table}>
                <View style={styles.row}>
                  <ThemedText style={[styles.rowLabel, styles.head]} />
                  <View style={styles.rowVals}>
                    <ThemedText style={[styles.rowVal, styles.head]}>{t('dashboards.total')}</ThemedText>
                    <ThemedText style={[styles.rowVal, styles.head]}>{t('dashboards.newCustomers')}</ThemedText>
                    <ThemedText style={[styles.rowVal, styles.head]}>{t('dashboards.repeatCustomers')}</ThemedText>
                  </View>
                </View>
                {[...groups].reverse().map((g) => (
                  <View key={g.period_start} style={styles.row}>
                    <ThemedText style={styles.rowLabel}>{g.period_label}</ThemedText>
                    <View style={styles.rowVals}>
                      <ThemedText style={styles.rowVal}>{g.total}</ThemedText>
                      <ThemedText style={[styles.rowVal, { color: NEW }]}>
                        {g.new_customer_orders}
                      </ThemedText>
                      <ThemedText style={[styles.rowVal, { color: REPEAT }]}>
                        {g.repeat_customer_orders}
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
  defn: { fontSize: 11, color: '#6B7280', lineHeight: 16, marginTop: 8 },
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
