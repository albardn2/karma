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
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { BarChart, LineChart } from '@/components/Chart';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

/** A per-day point. `t` is a naive "YYYY-MM-DD", `v` a count or an amount. */
interface Point {
  t: string;
  v: number;
}

interface Overview {
  days: number;
  from: string;
  to: string;
  /** the currencies that actually appear in the window */
  currencies: string[];
  series: {
    /** money series are keyed BY CURRENCY — there is no combined series, by design */
    revenue: Record<string, Point[]>;
    collected: Record<string, Point[]>;
    orders: Point[];
    trips: Point[];
    new_customers: Point[];
  };
  totals: {
    revenue: Record<string, number>;
    collected: Record<string, number>;
    window_debt: Record<string, number>;
    orders: number;
    trips: number;
    new_customers: number;
  };
}

const RANGES = [
  { id: '7d', days: 7 },
  { id: '30d', days: 30 },
  { id: '90d', days: 90 },
  { id: '12m', days: 365 },
] as const;

/** At most this many marks across a phone-width chart. */
const MAX_MARKS = 30;

const money = (n?: number | null) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

const tick = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * Collapse a long daily series into at most MAX_MARKS marks by SUMMING.
 *
 * A year of daily bars at 375pt gives sub-pixel bars, and dropping points instead
 * would understate the total the bars are supposed to add up to. Summing is safe for
 * exactly the two things plotted here — counts, and money already narrowed to a
 * single currency. It would not be safe across currencies, which is why the currency
 * is chosen before anything reaches this function.
 */
function bucketize(points: Point[], maxMarks = MAX_MARKS): Point[] {
  if (points.length <= maxMarks) return points;
  const size = Math.ceil(points.length / maxMarks);
  const out: Point[] = [];
  for (let i = 0; i < points.length; i += size) {
    const slice = points.slice(i, i + size);
    out.push({ t: slice[0].t, v: slice.reduce((s, p) => s + Number(p.v ?? 0), 0) });
  }
  return out;
}

/**
 * The landing dashboard: money and activity over a window.
 *
 * One endpoint backs all of it — GET /dashboard/overview?days=N — and it is the only
 * forgiving endpoint in this API. It reads request.args directly rather than through a
 * DTO, so it CLAMPS days to 1..365 instead of rejecting, and ignores unknown params
 * rather than 422-ing the request. Everything else here is extra="forbid"; do not
 * generalise this endpoint's tolerance to the rest.
 *
 * Money is reported per currency and never combined. Revenue, collected and
 * outstanding all read from the selected currency's bucket; the counts below them are
 * currency-free. Adding SYP to USD would produce a number with no meaning, and since
 * the 2026-07-28 redenomination the two are three orders of magnitude apart.
 *
 * The route requires admin, super-admin, operation manager or accountant. The default
 * role presets grant the `dashboard` module to exactly those roles, so a driver or
 * salesperson never sees the tile rather than seeing it and hitting a 403 — the
 * presets are generated from these same decorators, which is what keeps the two
 * gates in step.
 */
export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useLanguage();
  const [data, setData] = useState<Overview | null>(null);
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('30d');
  const [currency, setCurrency] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      const days = RANGES.find((r) => r.id === range)!.days;
      try {
        const res = await apiCall<Overview>(`/dashboard/overview?days=${days}`);
        if (isOk(res.status) && res.data) setData(res.data);
        else setFailed(true);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range],
  );

  useEffect(() => {
    load();
  }, [load]);

  // the chosen currency, or the first the window actually contains
  const cur = currency ?? data?.currencies?.[0] ?? null;
  const revenue = cur ? (data?.series?.revenue?.[cur] ?? []) : [];
  const collected = cur ? (data?.series?.collected?.[cur] ?? []) : [];
  const chartW = width - 72;

  return (
    <ModuleGuard module="dashboard">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="dashboard-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('menu.dashboard')}
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
          <View style={styles.chips}>
            {RANGES.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={[styles.chip, range === r.id && styles.chipOn]}
                onPress={() => setRange(r.id)}
                testID={`dash-range-${r.id}`}
              >
                <ThemedText style={[styles.chipText, range === r.id && styles.chipTextOn]}>
                  {t(`dashboard.range.${r.id}`)}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <View style={styles.centre}>
              <ActivityIndicator size="large" color="#5469D4" />
            </View>
          ) : failed || !data ? (
            <View style={styles.centre}>
              <ThemedText style={styles.stateText} testID="dashboard-error">
                {t('moduleList.failed')}
              </ThemedText>
              <TouchableOpacity style={styles.retry} onPress={() => load()}>
                <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {(data.currencies ?? []).length > 1 && (
                <View style={styles.chips}>
                  {data.currencies.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.chip, cur === c && styles.chipOn]}
                      onPress={() => setCurrency(c)}
                      testID={`dash-currency-${c}`}
                    >
                      <ThemedText style={[styles.chipText, cur === c && styles.chipTextOn]}>
                        {c}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* money, all in `cur` — never a cross-currency sum */}
              <View style={styles.cards}>
                {[
                  [t('dashboard.revenue'), money(cur ? data.totals?.revenue?.[cur] : null)],
                  [t('dashboard.collected'), money(cur ? data.totals?.collected?.[cur] : null)],
                  [t('dashboard.outstanding'), money(cur ? data.totals?.window_debt?.[cur] : null)],
                ].map(([k, v]) => (
                  <View key={k} style={styles.card} testID={`dash-stat-${k}`}>
                    <ThemedText style={styles.cardLabel}>
                      {k}
                      {cur ? ` (${cur})` : ''}
                    </ThemedText>
                    <ThemedText style={styles.cardValue} numberOfLines={1}>
                      {v}
                    </ThemedText>
                  </View>
                ))}
              </View>

              {/* counts carry no currency */}
              <View style={styles.cards}>
                {[
                  [t('dashboard.orders'), String(data.totals?.orders ?? 0)],
                  [t('dashboard.trips'), String(data.totals?.trips ?? 0)],
                  [t('dashboard.newCustomers'), String(data.totals?.new_customers ?? 0)],
                ].map(([k, v]) => (
                  <View key={k} style={styles.card} testID={`dash-stat-${k}`}>
                    <ThemedText style={styles.cardLabel}>{k}</ThemedText>
                    <ThemedText style={styles.cardValue} numberOfLines={1}>
                      {v}
                    </ThemedText>
                  </View>
                ))}
              </View>

              {!!revenue.length && (
                <>
                  <ThemedText style={styles.sectionTitle}>
                    {t('dashboard.moneyOverTime')}
                    {cur ? ` (${cur})` : ''}
                  </ThemedText>
                  <View style={styles.panel}>
                    <LineChart
                      width={chartW}
                      series={[
                        {
                          name: t('dashboard.revenue'),
                          points: bucketize(revenue).map((p) => ({
                            label: tick(p.t),
                            value: Number(p.v ?? 0),
                          })),
                        },
                        {
                          name: t('dashboard.collected'),
                          points: bucketize(collected).map((p) => ({
                            label: tick(p.t),
                            value: Number(p.v ?? 0),
                          })),
                        },
                      ]}
                    />
                    <View style={styles.legend}>
                      <LegendItem colour="#5469D4" label={t('dashboard.revenue')} />
                      <LegendItem colour="#16a34a" label={t('dashboard.collected')} />
                    </View>
                    {revenue.length > MAX_MARKS && (
                      <ThemedText style={styles.note}>
                        {t('dashboard.grouped', { days: Math.ceil(revenue.length / MAX_MARKS) })}
                      </ThemedText>
                    )}
                  </View>
                </>
              )}

              {!!data.series?.orders?.length && (
                <>
                  <ThemedText style={styles.sectionTitle}>{t('dashboard.ordersOverTime')}</ThemedText>
                  <View style={styles.panel}>
                    <BarChart
                      width={chartW}
                      data={bucketize(data.series.orders).map((p) => ({
                        label: tick(p.t),
                        value: Number(p.v ?? 0),
                      }))}
                    />
                  </View>
                </>
              )}
            </>
          )}
        </ScrollView>
        <BottomNavigation activeTab="menu" onTabPress={() => router.replace('/(tabs)?tab=menu')} />
      </ThemedView>
    </ModuleGuard>
  );
}

function LegendItem({ colour, label }: { colour: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.swatch, { backgroundColor: colour }]} />
      <ThemedText style={styles.legendText}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 20, paddingTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  chipOn: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextOn: { color: '#fff' },
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10 },
  card: { flexGrow: 1, flexBasis: '30%', backgroundColor: '#fff', borderRadius: 12, padding: 14 },
  cardLabel: { fontSize: 11, opacity: 0.6 },
  cardValue: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: '#1f2937', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  panel: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  legend: { flexDirection: 'row', gap: 14, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 9, height: 9, borderRadius: 2 },
  legendText: { fontSize: 11, opacity: 0.7 },
  note: { fontSize: 11, opacity: 0.5, marginTop: 8 },
  centre: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateText: { fontSize: 14, opacity: 0.6, textAlign: 'center' },
  retry: {
    backgroundColor: '#5469D4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
