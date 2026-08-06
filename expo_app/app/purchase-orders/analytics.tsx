import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { PickerField } from '@/components/PickerField';
import { BarChart, ChartLegend, LineChart } from '@/components/Chart';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { money } from '@/utils/money';
import { parseTs } from '@/utils/date';

interface Line {
  uuid: string;
  material_uuid?: string | null;
  material_name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  total_price?: number | null;
  currency?: string | null;
  is_deleted?: boolean | null;
  created_at: string;
}

interface Order {
  uuid: string;
  currency?: string | null;
  created_at: string;
  purchase_order_items?: Line[] | null;
}

/** Range presets, each with the bucket granularity that keeps the x-axis readable. */
const RANGES = [
  { id: '30d', days: 30, bucket: 'day' },
  { id: '90d', days: 90, bucket: 'week' },
  { id: '6m', days: 182, bucket: 'month' },
  { id: '12m', days: 365, bucket: 'month' },
  { id: 'all', days: null, bucket: 'month' },
] as const;

type Gran = 'day' | 'week' | 'month';

/** Chart at most this many materials — a phone-width chart of twenty is a smear. */
const MAX_SERIES = 4;
/** The list DTO declares per_page le=100, and 101 is a 422 rather than a clamp. */
const PER_PAGE = 100;
/** Both list endpoints order created_at DESC with no ordering param, so a cap here
 *  truncates the OLDEST orders — which is why exceeding it is stated on screen. */
const MAX_PAGES = 5;

/**
 * Naive ISO, no zone suffix.
 *
 * NOT because this endpoint rejects one — it accepts `…Z` with a 200 and then silently
 * shifts the window by the offset, which is worse than a rejection. The analytics
 * routes elsewhere in this API do reject it outright. Same output either way, and the
 * reason matters to whoever edits this next.
 */
const naiveIso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '');

const bucketOf = (d: Date, gran: Gran): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  if (gran === 'month') return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
  const x = new Date(d);
  // week buckets start Monday, so a label is the same day every time
  if (gran === 'week') x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
};

const bucketLabel = (key: string, gran: Gran): string =>
  gran === 'month'
    ? `${Number(key.slice(5, 7))}/${key.slice(2, 4)}`
    : `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;

const qty = (n: number) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));

/**
 * What the business bought, over time, by material.
 *
 * THERE IS NO PURCHASE-ORDER ANALYTICS ENDPOINT. Every other analytics screen in this
 * app renders a server aggregate; this one has none to render — the API exposes
 * customer, expense, inventory and trip-stop analytics and nothing for purchasing, and
 * the web app has no purchasing chart either. So the aggregation happens here, over the
 * order list, and the honest consequences are stated on screen rather than hidden:
 * a page cap, one currency at a time, and at most four materials.
 *
 * IT SOURCES THE ORDER LIST, NOT THE ITEM LIST, and that choice is load-bearing. A
 * driver holds `purchase_order: read` but has no `purchase_order_item` grant at all, so
 * /purchase-order-item/ answers 403 for them while /purchase-order/ answers 200. Since
 * the orders embed their lines, sourcing from the item endpoint would have broken this
 * screen for precisely the people who are allowed to see the list it hangs off.
 *
 * EMBEDDED LINES MUST BE FILTERED ON is_deleted. The relationship that produces
 * `purchase_order_items` carries no is_deleted predicate, while the `total_amount`
 * hybrid that sits beside it does — so the array can disagree with the order's own
 * total. There are no such rows on production today; the filter is here because the
 * model permits them, not because they were observed.
 *
 * THE DEFAULT RANGE IS 12 MONTHS, not the 90 days the other analytics screens use.
 * Production's newest purchase order is from March, so a 90-day window contains zero
 * lines and the screen would open on an empty chart for every real user.
 *
 * Each line contributes at ITS OWN currency, never the parent order's. The domain
 * overwrites a line's currency on create-with-items, but the per-item routes do not,
 * and `total_amount` sums line prices regardless of currency — so a mixed order is
 * constructible and the backend itself would add across it. This screen will not.
 */
export default function PurchaseOrderAnalyticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t, tef } = useLanguage();

  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('12m');
  const [metric, setMetric] = useState<'spend' | 'quantity'>('spend');
  const [currency, setCurrency] = useState<string | null>(null);
  const [material, setMaterial] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [truncated, setTruncated] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      try {
        const preset = RANGES.find((r) => r.id === range)!;
        let from = '';
        if (preset.days != null) {
          const d = new Date();
          d.setDate(d.getDate() - preset.days);
          from = `&start_date=${encodeURIComponent(naiveIso(d))}`;
        }
        const url = (page: number) =>
          `/purchase-order/?per_page=${PER_PAGE}&page=${page}${from}`;

        const first = await apiCall<{ purchase_orders?: Order[]; pages?: number }>(url(1));
        if (!isOk(first.status)) {
          setFailed(true);
          setOrders([]);
          return;
        }
        const all = [...(first.data?.purchase_orders ?? [])];
        const pages = Number(first.data?.pages ?? 1);
        const fetchTo = Math.min(pages, MAX_PAGES);
        if (fetchTo > 1) {
          const rest = await Promise.all(
            Array.from({ length: fetchTo - 1 }, (_, i) =>
              apiCall<{ purchase_orders?: Order[] }>(url(i + 2)),
            ),
          );
          for (const r of rest) {
            if (isOk(r.status)) all.push(...(r.data?.purchase_orders ?? []));
          }
        }
        // ordering is created_at DESC, so anything past the cap is the OLDEST
        setTruncated(pages > MAX_PAGES ? all.length : 0);
        setOrders(all);
      } catch {
        setFailed(true);
        setOrders([]);
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

  /** every live line in the window, flattened out of its order */
  const lines = useMemo(
    () =>
      orders.flatMap((o) => (o.purchase_order_items ?? []).filter((li) => !li.is_deleted)),
    [orders],
  );

  const currencies = useMemo(() => {
    const set = new Set<string>();
    for (const li of lines) if (li.currency) set.add(li.currency);
    return [...set].sort();
  }, [lines]);

  const ccy = currency ?? (currencies.includes('USD') ? 'USD' : currencies[0] ?? 'USD');
  const inCcy = useMemo(() => lines.filter((li) => li.currency === ccy), [lines, ccy]);

  /**
   * The material filter's own options, derived from the lines actually charted.
   *
   * Never from /material/: the catalogue includes materials that were never purchased,
   * which would chart nothing, and it is not readable by every user who can read this
   * list. What is on the chart is what the filter offers.
   */
  const materialRows = useMemo(() => {
    const m = new Map<string, { uuid: string; name: string; unit: string }>();
    for (const li of inCcy) {
      if (li.material_uuid && !m.has(li.material_uuid)) {
        m.set(li.material_uuid, {
          uuid: li.material_uuid,
          name: li.material_name ?? '—',
          unit: li.unit ?? '',
        });
      }
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [inCcy]);

  const gran: Gran = RANGES.find((r) => r.id === range)!.bucket;

  const { series, shown, spend, orderCount } = useMemo(() => {
    const picked = material ? inCcy.filter((li) => li.material_uuid === material) : inCcy;

    // one ordered x-axis shared by every series, so the lines line up and a bucket
    // with no purchases of one material still reads as zero rather than closing a gap
    const keys = [...new Set(picked.map((li) => bucketOf(parseTs(li.created_at), gran)))].sort();

    const byMaterial = new Map<string, { name: string; unit: string; buckets: Map<string, number> }>();
    for (const li of picked) {
      const id = li.material_uuid ?? '—';
      let entry = byMaterial.get(id);
      if (!entry) {
        entry = {
          name: li.material_name ?? '—',
          unit: li.unit ?? '',
          buckets: new Map(),
        };
        byMaterial.set(id, entry);
      }
      const key = bucketOf(parseTs(li.created_at), gran);
      const add =
        metric === 'spend' ? Number(li.total_price ?? 0) : Number(li.quantity ?? 0);
      entry.buckets.set(key, (entry.buckets.get(key) ?? 0) + add);
    }

    const ranked = [...byMaterial.values()]
      .map((e) => ({
        e,
        total: [...e.buckets.values()].reduce((s, v) => s + v, 0),
      }))
      .sort((a, b) => b.total - a.total);
    const top = ranked.slice(0, MAX_SERIES);

    return {
      series: top.map(({ e }) => ({
        // the unit rides in the name: on the quantity metric two series can be in
        // different units, and the legend is the only place that can say so
        name: metric === 'quantity' && e.unit ? `${e.name} (${tef(e.unit)})` : e.name,
        points: keys.map((k) => ({
          label: bucketLabel(k, gran),
          value: e.buckets.get(k) ?? 0,
        })),
      })),
      shown: top.length,
      // spend is always in ONE currency; the quantity metric never produces a total,
      // because adding kilograms to pieces is not a smaller version of a real number
      spend: picked.reduce((s, li) => s + Number(li.total_price ?? 0), 0),
      orderCount: new Set(
        orders
          .filter((o) =>
            (o.purchase_order_items ?? []).some(
              (li) =>
                !li.is_deleted &&
                li.currency === ccy &&
                (!material || li.material_uuid === material),
            ),
          )
          .map((o) => o.uuid),
      ).size,
    };
  }, [inCcy, material, gran, metric, orders, ccy, tef]);

  const lineCount = material
    ? inCcy.filter((li) => li.material_uuid === material).length
    : inCcy.length;
  const chartWidth = width - 72;

  return (
    <ModuleGuard module="purchase-orders">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="analytics-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle}>{t('purchaseOrders.analytics')}</ThemedText>
          <View style={styles.backSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: 40 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
          >
            {RANGES.map((r) => (
              <TouchableOpacity
                key={r.id}
                style={[styles.chip, range === r.id && styles.chipOn]}
                onPress={() => setRange(r.id)}
                testID={`range-${r.id}`}
              >
                <ThemedText style={[styles.chipText, range === r.id && styles.chipTextOn]}>
                  {t(`expenses.range.${r.id}`)}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </ScrollView>

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
          ) : (
            <>
              <View style={styles.chips}>
                {(
                  [
                    ['spend', t('purchaseOrders.spend')],
                    ['quantity', t('purchaseOrders.quantityMetric')],
                  ] as const
                ).map(([id, label]) => (
                  <TouchableOpacity
                    key={id}
                    style={[styles.chip, metric === id && styles.chipOn]}
                    onPress={() => setMetric(id)}
                    testID={`metric-${id}`}
                  >
                    <ThemedText style={[styles.chipText, metric === id && styles.chipTextOn]}>
                      {label}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>

              {/* only when there is a choice to make — one currency needs no selector */}
              {currencies.length > 1 && (
                <View style={styles.chips}>
                  {currencies.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.chip, ccy === c && styles.chipOn]}
                      onPress={() => {
                        setCurrency(c);
                        setMaterial('');
                      }}
                      testID={`currency-${c}`}
                    >
                      <ThemedText style={[styles.chipText, ccy === c && styles.chipTextOn]}>
                        {tef(c)}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={styles.filterRow}>
                <ThemedText style={styles.filterLabel}>{t('inventory.material')}</ThemedText>
                {!!material && (
                  <TouchableOpacity onPress={() => setMaterial('')} testID="material-clear">
                    <ThemedText style={styles.clear}>
                      {t('warehouses.showTopMaterials')}
                    </ThemedText>
                  </TouchableOpacity>
                )}
              </View>
              <PickerField
                spec={{
                  // rows, not an endpoint: see materialRows above
                  endpoint: '/material/',
                  itemsKey: 'materials',
                  rows: materialRows,
                  label: (m) => m.name,
                  value: (m) => m.uuid,
                  sublabel: (m) => (m.unit ? tef(m.unit) : undefined),
                }}
                value={material}
                onChange={(v) => setMaterial(v)}
                testID="material-filter"
              />

              <View style={styles.statBar}>
                <ThemedText style={styles.statValue} testID="stat-spend">
                  {money(spend, ccy)}
                </ThemedText>
                <ThemedText style={styles.statMeta}>
                  {t('purchaseOrders.summary', {
                    orders: String(orderCount),
                    lines: String(lineCount),
                  })}
                </ThemedText>
              </View>

              <View style={styles.panel}>
                {!series.length ? (
                  <ThemedText style={styles.stateText}>
                    {t('purchaseOrders.noneInRange')}
                  </ThemedText>
                ) : series.length === 1 ? (
                  <>
                    <BarChart width={chartWidth} data={series[0].points} />
                    <ThemedText style={styles.seriesName}>{series[0].name}</ThemedText>
                  </>
                ) : (
                  <>
                    {/* no step: these are per-bucket totals, not a running level */}
                    <LineChart width={chartWidth} series={series} />
                    <ChartLegend names={series.map((s) => s.name)} />
                  </>
                )}
              </View>

              {!!series.length && (
                <>
                  {!material && materialRows.length > shown && (
                    <ThemedText style={styles.footnote}>
                      {t('warehouses.topMaterials', { shown: String(shown) })}
                    </ThemedText>
                  )}
                  {/* a quantity total is only meaningful for ONE material — across
                      materials it would add kilograms to pieces */}
                  {metric === 'quantity' && !!material && (
                    <ThemedText style={styles.footnote}>
                      {`${t('purchaseOrders.quantityMetric')}: ${qty(
                        inCcy
                          .filter((li) => li.material_uuid === material)
                          .reduce((s, li) => s + Number(li.quantity ?? 0), 0),
                      )} ${tef(materialRows.find((m) => m.uuid === material)?.unit ?? '')}`.trim()}
                    </ThemedText>
                  )}
                  <ThemedText style={styles.footnote}>
                    {t('purchaseOrders.oneCurrency')}
                  </ThemedText>
                  {!!truncated && (
                    <ThemedText style={styles.footnote}>
                      {t('purchaseOrders.newestOnly', { count: String(truncated) })}
                    </ThemedText>
                  )}
                </>
              )}
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
  chips: { flexDirection: 'row', gap: 8, marginBottom: 14, alignItems: 'center' },
  chip: {
    // the trips filter-chip design — one look for every filter bar
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipOn: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#4B5563' },
  chipTextOn: { color: '#fff' },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  filterLabel: { fontSize: 14, fontWeight: '600', opacity: 0.75 },
  clear: { fontSize: 12, fontWeight: '700', color: '#5469D4' },
  statBar: { marginTop: 18, marginBottom: 10 },
  statValue: { fontSize: 24, lineHeight: 30, fontWeight: '700', color: '#1f2937' },
  statMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  panel: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  seriesName: { fontSize: 12, fontWeight: '600', textAlign: 'center', opacity: 0.7, marginTop: 6 },
  footnote: { fontSize: 11, opacity: 0.5, lineHeight: 16, marginTop: 8 },
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
