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
import { StackedBarChart, ChartLegend, SERIES_COLOURS } from '@/components/Chart';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { money } from '@/utils/money';

interface Group {
  period_label: string;
  period_start: string;
  total: number;
  breakdown: Record<string, number>;
}
interface Disclosure {
  unconverted_amount: number;
  unconverted_count: number;
  salaries_backed: boolean;
}
interface Payload {
  target_currency: string;
  granularity: string;
  categories: string[];
  groups: Group[];
  disclosure: Disclosure;
}

type Gran = 'year' | 'quarter' | 'month' | 'week';

/**
 * Expenses & salaries per period, a colour-coded stacked bar.
 *
 * One segment per expense category plus a salaries segment (employee payouts — the
 * same definition profitability uses; salaries are not an expense category). The
 * server returns the ordered `categories` present and each period's converted
 * breakdown, so the client only stacks what it is given. Segment colours are the
 * shared SERIES_COLOURS by position, matching the web and the legend.
 */
export default function SpendScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t, tef } = useLanguage();

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
        `/dashboard/expenses-breakdown?granularity=${gran}&target_currency=${ccy}`,
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
  const categories = data?.categories ?? [];
  const groups = data?.groups ?? [];
  const hasAny = groups.some((g) => g.total !== 0);
  // salaries has its own key; expense categories reuse the app's enum prettifier
  const label = (cat: string) => (cat === 'salaries' ? t('dashboards.salaries') : tef(cat));
  const names = categories.map(label);

  const GRANS: Array<[Gran, string]> = [
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
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="spend-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle}>{t('dashboards.spend')}</ThemedText>
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
                <FilterChip key={g} label={l} active={gran === g} onPress={() => setGran(g)} testID={`spend-gran-${g}`} />
              ))}
            </ScrollingChipRow>
            <CostCurrencyToggle value={ccy} onChange={setCcy} testIDPrefix="spend-ccy" />
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
                  series={names}
                  data={groups.map((g) => ({
                    label: g.period_label,
                    segments: categories.map((c) => g.breakdown[c] ?? 0),
                  }))}
                />
                <ChartLegend names={names} colours={SERIES_COLOURS} />
              </View>

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

              {/* per-period total + breakdown, newest first */}
              <View style={styles.table}>
                {[...groups].reverse().map((g) => (
                  <View key={g.period_label} style={styles.block}>
                    <View style={styles.row}>
                      <ThemedText style={styles.period}>{g.period_label}</ThemedText>
                      <ThemedText style={styles.total}>{money(g.total, ccy)}</ThemedText>
                    </View>
                    {categories
                      .filter((c) => (g.breakdown[c] ?? 0) !== 0)
                      .map((c, i) => (
                        <View key={c} style={styles.subRow}>
                          <View style={styles.legendRow}>
                            <View
                              style={[
                                styles.swatch,
                                { backgroundColor: SERIES_COLOURS[categories.indexOf(c) % SERIES_COLOURS.length] },
                              ]}
                            />
                            <ThemedText style={styles.subLabel}>{label(c)}</ThemedText>
                          </View>
                          <ThemedText style={styles.subVal}>{money(g.breakdown[c], ccy)}</ThemedText>
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
  caveat: { fontSize: 12, color: '#B45309', lineHeight: 17, marginTop: 8 },
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
