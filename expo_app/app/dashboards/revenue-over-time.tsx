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
import { CostCurrencyToggle, CostCcy } from '@/components/CostCurrencyToggle';
import { LineChart, StackedBarChart, ChartLegend } from '@/components/Chart';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { money } from '@/utils/money';

interface Group {
  period_label: string;
  period_start: string;
  revenue: number;
  received: number;
  debt: number;
  cumulative_revenue: number;
  cumulative_debt: number;
}
interface Disclosure {
  unconverted_amount: number;
  unconverted_count: number;
}
interface Payload {
  target_currency: string;
  granularity: string;
  groups: Group[];
  disclosure: Disclosure;
}

type Gran = 'year' | 'quarter' | 'month' | 'week';
type Mode = 'cumulative' | 'bars';

// received (collected) reads as green, debt (outstanding) as red; the cumulative
// revenue curve is the brand blue, its debt curve red — same red for debt in both.
const RECEIVED = '#16a34a';
const DEBT = '#dc2626';
const REVENUE = '#5469D4';

/**
 * Revenue over time, two ways from one endpoint:
 *   - cumulative: running revenue and running debt as two curves
 *   - per period: revenue split into received + debt as a stacked bar
 *
 * The server converts every amount at its own date and guarantees received + debt
 * equals that period's revenue, so the stacked bar's two segments always add up to
 * the bar — the client only draws what it is given and never does money maths.
 */
export function RevenueOverTimeScreenImpl({ mine = false }: { mine?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useLanguage();

  const [mode, setMode] = useState<Mode>('cumulative');
  const [gran, setGran] = useState<Gran>('month');
  const [ccy, setCcy] = useState<CostCcy>('USD');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  // the personal variant hits the self-scoped endpoint: same maths, only the
  // caller's own orders
  const endpoint = mine ? '/dashboard/my-revenue-over-time' : '/dashboard/revenue-over-time';
  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      const res = await apiCall<Payload>(
        `${endpoint}?granularity=${gran}&target_currency=${ccy}`,
      );
      if (isOk(res.status) && res.data) setData(res.data);
      else setFailed(true);
      setLoading(false);
      setRefreshing(false);
    },
    [gran, ccy, endpoint],
  );

  useEffect(() => {
    load();
  }, [load]);

  const chartWidth = width - 72;
  const groups = data?.groups ?? [];
  const hasAny = groups.some((g) => g.revenue !== 0 || g.debt !== 0);

  const GRANS: Array<[Gran, string]> = [
    ['week', t('dashboards.gWeek')],
    ['month', t('dashboards.gMonth')],
    ['quarter', t('dashboards.gQuarter')],
    ['year', t('dashboards.gYear')],
  ];
  const MODES: Array<[Mode, string]> = [
    ['cumulative', t('dashboards.modeCumulative')],
    ['bars', t('dashboards.modeBars')],
  ];

  const cumNames = [t('dashboards.cumulativeRevenue'), t('dashboards.cumulativeDebt')];
  const barNames = [t('dashboards.received'), t('dashboards.debt')];

  return (
    <ModuleGuard module="dashboard">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="rot-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle}>
            {t(mine ? 'dashboards.myRevenue' : 'dashboards.revenueOverTime')}
          </ThemedText>
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
              {MODES.map(([m, label]) => (
                <FilterChip key={m} label={label} active={mode === m} onPress={() => setMode(m)} testID={`rot-mode-${m}`} />
              ))}
            </ScrollingChipRow>
            <ScrollingChipRow>
              {GRANS.map(([g, label]) => (
                <FilterChip key={g} label={label} active={gran === g} onPress={() => setGran(g)} testID={`rot-gran-${g}`} />
              ))}
            </ScrollingChipRow>
            <CostCurrencyToggle value={ccy} onChange={setCcy} testIDPrefix="rot-ccy" />
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
                {mode === 'cumulative' ? (
                  <>
                    <LineChart
                      width={chartWidth}
                      colours={[REVENUE, DEBT]}
                      series={[
                        {
                          name: cumNames[0],
                          points: groups.map((g) => ({
                            label: g.period_label,
                            value: g.cumulative_revenue,
                          })),
                        },
                        {
                          name: cumNames[1],
                          points: groups.map((g) => ({
                            label: g.period_label,
                            value: g.cumulative_debt,
                          })),
                        },
                      ]}
                    />
                    <ChartLegend names={cumNames} colours={[REVENUE, DEBT]} />
                  </>
                ) : (
                  <>
                    <StackedBarChart
                      width={chartWidth}
                      colours={[RECEIVED, DEBT]}
                      series={barNames}
                      data={groups.map((g) => ({
                        label: g.period_label,
                        segments: [g.received, g.debt],
                      }))}
                    />
                    <ChartLegend names={barNames} colours={[RECEIVED, DEBT]} />
                  </>
                )}
              </View>

              {/* what the split means, spelled out */}
              <ThemedText style={styles.defn}>{t('dashboards.receivedDebtNote')}</ThemedText>

              {!!data && data.disclosure.unconverted_count > 0 && (
                <ThemedText style={styles.caveat}>
                  {t('dashboards.unconverted', {
                    amount: money(data.disclosure.unconverted_amount, ccy),
                  })}
                </ThemedText>
              )}

              {/* the numbers behind the chart, newest first */}
              <View style={styles.table}>
                <View style={styles.row}>
                  <ThemedText style={[styles.rowLabel, styles.head]} />
                  <View style={styles.rowVals}>
                    <ThemedText style={[styles.rowVal, styles.head]}>{t('dashboards.revenue')}</ThemedText>
                    <ThemedText style={[styles.rowVal, styles.head]}>{t('dashboards.received')}</ThemedText>
                    <ThemedText style={[styles.rowVal, styles.head]}>{t('dashboards.debt')}</ThemedText>
                  </View>
                </View>
                {[...groups].reverse().map((g) => (
                  <View key={g.period_label} style={styles.row}>
                    <ThemedText style={styles.rowLabel}>{g.period_label}</ThemedText>
                    <View style={styles.rowVals}>
                      <ThemedText style={styles.rowVal}>{money(g.revenue, ccy)}</ThemedText>
                      <ThemedText style={[styles.rowVal, { color: RECEIVED }]}>{money(g.received, ccy)}</ThemedText>
                      <ThemedText style={[styles.rowVal, g.debt > 0 && { color: DEBT }]}>
                        {money(g.debt, ccy)}
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

export default function RevenueOverTimeScreen() {
  return <RevenueOverTimeScreenImpl />;
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
  caveat: { fontSize: 12, color: '#B45309', lineHeight: 17, marginTop: 8 },
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
