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
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { FilterChip, ScrollingChipRow } from '@/components/FilterChips';
import { LineChart, ChartLegend, SERIES_COLOURS } from '@/components/Chart';
import { MaterialsSoldScreenImpl } from '@/app/dashboards/materials-sold';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

interface Summary {
  user_uuid: string;
  username: string;
  stops: number;
  stops_with_sale: number;
  orders: number;
  orders_invoiced: number;
  revenue: Record<string, number>;
  paid: Record<string, number>;
  unpaid: Record<string, number>;
}

interface SalesBucket {
  period: string;
  revenue: Record<string, number>;
  orders: number;
}
interface SalesPayload {
  bucket: string;
  buckets: SalesBucket[];
}

type RangeKey = '30d' | '90d' | '6m' | '12m' | 'all';

// mirrors the web page's ranges (analytics/shared.tsx) so the two clients slice
// time identically: short ranges bucket daily, long ones monthly
const RANGES: Record<RangeKey, { days?: number; bucket: 'day' | 'week' | 'month' }> = {
  '30d': { days: 30, bucket: 'day' },
  '90d': { days: 90, bucket: 'day' },
  '6m': { days: 182, bucket: 'week' },
  '12m': { days: 365, bucket: 'month' },
  all: { bucket: 'month' },
};

const rangeStart = (r: RangeKey): string | null => {
  const days = RANGES[r].days;
  if (!days) return null;
  const d = new Date(Date.now() - days * 24 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
};

// "2026-07-01T00:00:00" -> "2026-07" for month buckets, "07-01" for day/week —
// phone-width labels; the tooltip-less chart carries only a few of them anyway
const periodLabel = (iso: string, bucket: string) =>
  bucket === 'month' ? iso.slice(0, 7) : iso.slice(5, 10);

/**
 * One user's analytics — the phone view of the web user-analytics tab.
 *
 * Summary tiles and the revenue-over-time curve come from the same
 * /trip-stop/analytics endpoints the web tab reads, and the materials section
 * embeds the same screen the dashboards use, pointed at the per-user endpoint —
 * so a number here always equals the number on the web page.
 *
 * Revenue is per-currency and currencies never add up: each currency is its own
 * line / its own tile row rather than a folded total.
 */
export default function UserAnalyticsScreen() {
  const { uuid, username } = useLocalSearchParams<{ uuid: string; username?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { width } = useWindowDimensions();

  const [range, setRange] = useState<RangeKey>('12m');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [sales, setSales] = useState<SalesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!uuid) return;
      if (!isRefresh) setLoading(true);
      setFailed(false);
      const start = rangeStart(range);
      const bucket = RANGES[range].bucket;
      const qs =
        `?user_uuid=${uuid}` + (start ? `&start_date=${start}` : '');
      const [s, so] = await Promise.all([
        apiCall<Summary>(`/trip-stop/analytics/user-summary${qs}`),
        apiCall<SalesPayload>(`/trip-stop/analytics/user-sales-over-time${qs}&bucket=${bucket}`),
      ]);
      if (isOk(s.status) && s.data) setSummary(s.data);
      else setFailed(true);
      if (isOk(so.status) && so.data) setSales(so.data);
      else setFailed(true);
      setLoading(false);
      setRefreshing(false);
    },
    [uuid, range],
  );

  useEffect(() => {
    load();
  }, [load]);

  const RANGE_CHIPS: Array<[RangeKey, string]> = [
    ['30d', t('ua.r30d')],
    ['90d', t('ua.r90d')],
    ['6m', t('ua.r6m')],
    ['12m', t('ua.r12m')],
    ['all', t('ua.rAll')],
  ];

  // one line per currency, in a stable order so colours don't shuffle between
  // range changes
  const currencies = Array.from(
    new Set((sales?.buckets ?? []).flatMap((b) => Object.keys(b.revenue ?? {}))),
  ).sort();
  const series = currencies.map((cur) => ({
    name: cur,
    points: (sales?.buckets ?? []).map((b) => ({
      label: periodLabel(b.period, sales?.bucket ?? 'month'),
      value: b.revenue?.[cur] ?? 0,
    })),
  }));

  const moneyRow = (label: string, map: Record<string, number> | undefined, testID: string) => {
    const entries = Object.entries(map ?? {}).filter(([, v]) => v !== 0);
    return (
      <View style={styles.moneyRow} testID={testID}>
        <ThemedText style={styles.moneyLabel}>{label}</ThemedText>
        <ThemedText style={styles.moneyVal}>
          {entries.length
            ? entries.map(([c, v]) => `${v.toLocaleString()} ${c}`).join('  ·  ')
            : '—'}
        </ThemedText>
      </View>
    );
  };

  return (
    <ModuleGuard requireAdmin>
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="ua-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {username ? `${t('ua.title')} · @${username}` : t('ua.title')}
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
          <ScrollingChipRow>
            {RANGE_CHIPS.map(([k, label]) => (
              <FilterChip
                key={k}
                label={label}
                active={range === k}
                onPress={() => setRange(k)}
                testID={`ua-range-${k}`}
              />
            ))}
          </ScrollingChipRow>

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
              {/* counts: what the user did in the window */}
              <View style={styles.tileRow}>
                <View style={styles.tile} testID="ua-stops">
                  <ThemedText style={styles.tileVal}>{summary?.stops ?? 0}</ThemedText>
                  <ThemedText style={styles.tileLabel}>{t('ua.stops')}</ThemedText>
                </View>
                <View style={styles.tile} testID="ua-stops-sale">
                  <ThemedText style={styles.tileVal}>{summary?.stops_with_sale ?? 0}</ThemedText>
                  <ThemedText style={styles.tileLabel}>{t('ua.stopsWithSale')}</ThemedText>
                </View>
                <View style={styles.tile} testID="ua-orders">
                  <ThemedText style={styles.tileVal}>{summary?.orders ?? 0}</ThemedText>
                  <ThemedText style={styles.tileLabel}>{t('ua.orders')}</ThemedText>
                </View>
              </View>

              {/* money: per currency, never folded into one number */}
              <View style={styles.panel}>
                {moneyRow(t('ua.revenue'), summary?.revenue, 'ua-revenue')}
                {moneyRow(t('ua.paid'), summary?.paid, 'ua-paid')}
                {moneyRow(t('ua.unpaid'), summary?.unpaid, 'ua-unpaid')}
              </View>

              {/* revenue over time, one line per currency */}
              <ThemedText style={styles.sectionTitle}>{t('ua.revenueOverTime')}</ThemedText>
              {series.length === 0 ? (
                <View style={styles.centreShort}>
                  <ThemedText style={styles.stateText}>{t('dashboards.noData')}</ThemedText>
                </View>
              ) : (
                <View style={styles.panel}>
                  <LineChart series={series} width={width - 72} />
                  <ChartLegend names={currencies} colours={SERIES_COLOURS} />
                </View>
              )}

              {/* the same materials chart + table the dashboards show, scoped to
                  orders this user created; it brings its own period navigator */}
              <MaterialsSoldScreenImpl userUuid={uuid} embedded />
            </>
          )}
        </ScrollView>
      </ThemedView>
    </ModuleGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  back: { fontSize: 28, color: '#5469D4', fontWeight: '600' },
  backSpacer: { width: 28 },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
  },
  body: { paddingHorizontal: 16, gap: 12 },
  centre: { paddingVertical: 48, alignItems: 'center', gap: 12 },
  centreShort: { paddingVertical: 24, alignItems: 'center' },
  stateText: { fontSize: 14, opacity: 0.6 },
  retry: {
    borderWidth: 1,
    borderColor: '#5469D4',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  retryText: { color: '#5469D4', fontWeight: '600' },
  tileRow: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1,
    backgroundColor: 'rgba(84,105,212,0.08)',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tileVal: { fontSize: 20, fontWeight: '800', color: '#1f2937' },
  tileLabel: { fontSize: 11, opacity: 0.6, marginTop: 2, textAlign: 'center' },
  panel: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
    gap: 8,
  },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  moneyLabel: { fontSize: 13, opacity: 0.6 },
  moneyVal: { fontSize: 13, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
});
