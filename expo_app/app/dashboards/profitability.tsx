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
import { GroupedBarChart, ChartLegend } from '@/components/Chart';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { money } from '@/utils/money';

interface Group {
  period_label: string;
  period_start: string;
  revenue: number;
  gross: number;
  net: number;
}
interface Disclosure {
  uncosted_quantity: number;
  unconverted_amount: number;
  unconverted_count: number;
  salaries_backed: boolean;
}
interface Payload {
  target_currency: string;
  granularity: string;
  groups: Group[];
  disclosure: Disclosure;
}

type Gran = 'year' | 'quarter' | 'month';

/**
 * Revenue, gross and net per period, as a grouped three-bar chart.
 *
 * The three bars are Revenue, Gross (revenue − cost of goods) and Net (gross −
 * expenses − salaries), every figure already converted to the chosen currency by
 * the server — the client never does money maths, it just draws what it is given,
 * so it can never disagree with the endpoint's own conversion.
 *
 * The disclosure line is not decoration: cost of goods is reconstructed from the
 * stock each sale consumed, and a sale from an uncosted lot is excluded rather
 * than counted as free — so the chart says how many units it left out instead of
 * quietly overstating gross. And until employee payouts exist, net is "before
 * salaries" rather than a real subtraction.
 */
export function ProfitabilityScreenImpl({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useLanguage();

  const [gran, setGran] = useState<Gran>('month');
  const [ccy, setCcy] = useState<CostCcy>('USD');
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      const res = await apiCall<Payload>(
        `/dashboard/profitability?granularity=${gran}&target_currency=${ccy}`,
      );
      if (isOk(res.status) && res.data) setData(res.data);
      else setFailed(true);
      setLoading(false);
      setRefreshing(false);
    },
    [gran, ccy],
  );

  useEffect(() => {
    load();
  }, [load]);

  const chartWidth = width - 72;
  const groups = (data?.groups ?? []).map((g) => ({
    label: g.period_label,
    values: [g.revenue, g.gross, g.net],
  }));
  const hasAny = groups.some((g) => g.values.some((v) => v !== 0));
  const seriesNames = [t('dashboards.revenue'), t('dashboards.gross'), t('dashboards.net')];

  const GRANS: Array<[Gran, string]> = [
    ['year', t('dashboards.gYear')],
    ['quarter', t('dashboards.gQuarter')],
    ['month', t('dashboards.gMonth')],
  ];

  const inner = (
    <>
          <View style={styles.controls}>
            <ScrollingChipRow>
              {GRANS.map(([g, label]) => (
                <FilterChip key={g} label={label} active={gran === g} onPress={() => setGran(g)} testID={`prof-gran-${g}`} />
              ))}
            </ScrollingChipRow>
            <CostCurrencyToggle value={ccy} onChange={setCcy} testIDPrefix="prof-ccy" />
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
                <GroupedBarChart groups={groups} series={seriesNames} width={chartWidth} />
                <ChartLegend names={seriesNames} />
              </View>

              {/* what the three bars mean, spelled out */}
              <ThemedText style={styles.defn}>{t('dashboards.grossFull')}</ThemedText>
              <ThemedText style={styles.defn}>{t('dashboards.netFull')}</ThemedText>

              {/* honest caveats, never hidden */}
              {!!data && data.disclosure.uncosted_quantity > 0 && (
                <ThemedText style={styles.caveat}>
                  {t('dashboards.uncosted', { qty: String(data.disclosure.uncosted_quantity) })}
                </ThemedText>
              )}
              {!!data && !data.disclosure.salaries_backed && (
                <ThemedText style={styles.caveat}>{t('dashboards.beforeSalaries')}</ThemedText>
              )}
              {!!data && data.disclosure.unconverted_count > 0 && (
                <ThemedText style={styles.caveat}>
                  {t('dashboards.unconverted', {
                    amount: money(data.disclosure.unconverted_amount, ccy),
                  })}
                </ThemedText>
              )}

              {/* the numbers behind the bars, newest first */}
              <View style={styles.table}>
                {[...(data?.groups ?? [])].reverse().map((g) => (
                  <View key={g.period_label} style={styles.row}>
                    <ThemedText style={styles.rowLabel}>{g.period_label}</ThemedText>
                    <View style={styles.rowVals}>
                      <ThemedText style={styles.rowVal}>{money(g.revenue, ccy)}</ThemedText>
                      <ThemedText style={styles.rowVal}>{money(g.gross, ccy)}</ThemedText>
                      <ThemedText style={[styles.rowVal, g.net < 0 && styles.neg]}>
                        {money(g.net, ccy)}
                      </ThemedText>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
    </>
  );

  // Home stacks this panel inside its own scroller: section title in place
  // of the top bar, and no ScrollView / guard of its own
  if (embedded) {
    return (
      <View style={styles.embeddedSection}>
        <ThemedText style={styles.embeddedTitle}>{t('dashboards.profitability')}</ThemedText>
        {inner}
      </View>
    );
  }

  return (
    <ModuleGuard module="dashboard">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="prof-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle}>{t('dashboards.profitability')}</ThemedText>
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
          {inner}
        </ScrollView>
      </ThemedView>
    </ModuleGuard>
  );
}

export default function ProfitabilityScreen() {
  return <ProfitabilityScreenImpl />;
}

const styles = StyleSheet.create({
  embeddedSection: { paddingHorizontal: 20 },
  embeddedTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 12, textAlign: 'left' },
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
  rowLabel: { width: 64, fontSize: 12, fontWeight: '700', color: '#111827' },
  rowVals: { flex: 1, flexDirection: 'row', justifyContent: 'space-between' },
  rowVal: { fontSize: 12, color: '#374151', fontVariant: ['tabular-nums'] },
  neg: { color: '#dc2626' },
  centre: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  retry: { backgroundColor: '#5469D4', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '600' },
});
