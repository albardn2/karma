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
import { BarChart, ChartLegend, SERIES_COLOURS } from '@/components/Chart';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

interface Bucket {
  period: string;
  total: number;
  amounts: Record<string, number>;
}

interface Analytics {
  bucket: string;
  buckets: Bucket[];
  categories: string[];
  category_totals: Record<string, number>;
  currencies: Record<string, number>;
  currency: string;
  total: number;
  paid: number;
  unpaid: number;
  count: number;
}

/** Range presets, mapped to the bucket granularity that keeps the x-axis readable. */
const RANGES = [
  { id: '30d', days: 30, bucket: 'day' },
  { id: '90d', days: 90, bucket: 'week' },
  { id: '6m', days: 182, bucket: 'month' },
  { id: '12m', days: 365, bucket: 'month' },
  { id: 'all', days: 0, bucket: 'month' },
] as const;

const label = (iso: string, bucket: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return bucket === 'day' || bucket === 'week'
    ? `${d.getMonth() + 1}/${d.getDate()}`
    : `${d.getMonth() + 1}/${String(d.getFullYear()).slice(2)}`;
};

/**
 * Expense analytics.
 *
 * The one thing this screen must not do is add across currencies. The endpoint
 * reports per-currency totals and picks a default, and summing SYP onto USD would
 * produce a number that looks authoritative and means nothing — so currency is an
 * explicit selector and every figure on screen belongs to exactly one.
 */
export default function ExpenseAnalyticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t, tef } = useLanguage();
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('90d');
  const [currency, setCurrency] = useState<string | null>(null);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      try {
        const preset = RANGES.find((r) => r.id === range)!;
        const q = new URLSearchParams({ bucket: preset.bucket });
        if (preset.days) {
          const from = new Date();
          from.setDate(from.getDate() - preset.days);
          // NAIVE ISO, no trailing Z. The backend parses these as naive local
          // datetimes and rejects a zone suffix outright — toISOString() always
          // appends Z, which 400s with "Invalid date".
          q.append('start_date', from.toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, ''));
        }
        if (currency) q.append('currency', currency);
        const res = await apiCall<Analytics>(`/expense/analytics/over-time?${q.toString()}`);
        if (isOk(res.status) && res.data) setData(res.data);
        else setFailed(true);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [range, currency],
  );

  useEffect(() => {
    load();
  }, [load]);

  const money = (n: number) => `${Number(n ?? 0).toFixed(2)} ${data?.currency ?? ''}`;
  const chartWidth = width - 72;

  return (
    <ModuleGuard module="expenses">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="analytics-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle}>{t('expenses.analytics')}</ThemedText>
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
                testID={`range-${r.id}`}
              >
                <ThemedText style={[styles.chipText, range === r.id && styles.chipTextOn]}>
                  {t(`expenses.range.${r.id}`)}
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
              <ThemedText style={styles.stateText}>{t('moduleList.failed')}</ThemedText>
              <TouchableOpacity style={styles.retry} onPress={() => load()}>
                <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* every figure below is in ONE currency — never a cross-currency sum */}
              {Object.keys(data.currencies ?? {}).length > 1 && (
                <View style={styles.chips}>
                  {Object.keys(data.currencies).map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.chip, (currency ?? data.currency) === c && styles.chipOn]}
                      onPress={() => setCurrency(c)}
                      testID={`currency-${c}`}
                    >
                      <ThemedText
                        style={[
                          styles.chipText,
                          (currency ?? data.currency) === c && styles.chipTextOn,
                        ]}
                      >
                        {c}
                      </ThemedText>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View style={styles.cards}>
                {[
                  [t('expenses.totalSpend'), money(data.total)],
                  [t('expenses.paidOut'), money(data.paid)],
                  [t('expenses.stillOwed'), money(data.unpaid)],
                  [t('expenses.entries'), String(data.count ?? 0)],
                ].map(([k, v]) => (
                  <View key={k} style={styles.card} testID={`stat-${k}`}>
                    <ThemedText style={styles.cardLabel}>{k}</ThemedText>
                    <ThemedText style={styles.cardValue} numberOfLines={1}>
                      {v}
                    </ThemedText>
                  </View>
                ))}
              </View>

              <ThemedText style={styles.sectionTitle}>{t('expenses.overTime')}</ThemedText>
              <View style={styles.panel}>
                {data.buckets?.length ? (
                  <BarChart
                    width={chartWidth}
                    data={data.buckets.map((b) => ({
                      label: label(b.period, data.bucket),
                      value: Number(b.total ?? 0),
                    }))}
                  />
                ) : (
                  <ThemedText style={styles.stateText}>{t('moduleList.empty')}</ThemedText>
                )}
              </View>

              <ThemedText style={styles.sectionTitle}>{t('expenses.byCategory')}</ThemedText>
              <View style={styles.panel}>
                {Object.entries(data.category_totals ?? {}).length ? (
                  <>
                    {Object.entries(data.category_totals)
                      .sort((a, b) => Number(b[1]) - Number(a[1]))
                      .map(([cat, amount], i) => (
                        <View key={cat} style={styles.catRow}>
                          <View
                            style={[
                              styles.swatch,
                              { backgroundColor: SERIES_COLOURS[i % SERIES_COLOURS.length] },
                            ]}
                          />
                          <ThemedText style={styles.catName} numberOfLines={1}>
                            {tef(cat)}
                          </ThemedText>
                          <ThemedText style={styles.catValue}>{money(Number(amount))}</ThemedText>
                        </View>
                      ))}
                    <ChartLegend names={[]} />
                  </>
                ) : (
                  <ThemedText style={styles.stateText}>{t('moduleList.empty')}</ThemedText>
                )}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
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
  cards: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    flexGrow: 1,
    flexBasis: '46%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
  },
  cardLabel: { fontSize: 12, opacity: 0.6 },
  cardValue: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: '#1f2937', marginTop: 2 },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 22, marginBottom: 8 },
  panel: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  catName: { flex: 1, fontSize: 14, opacity: 0.8 },
  catValue: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
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
