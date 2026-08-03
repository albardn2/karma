import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { LineChart } from '@/components/Chart';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';

interface Rate {
  uuid: string;
  from_currency: string;
  to_currency: string;
  rate: number;
  buy_rate?: number | null;
  sell_rate?: number | null;
  rate_date: string;
  source?: string | null;
  notes?: string | null;
}

/** The DTO ceiling; also plenty for a trend line on a phone. */
const TREND_POINTS = 60;

const num = (n?: number | null) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 });

/**
 * The USD→SYP rate: today's number, where it has been, and a way to correct it.
 *
 * In a business that buys in dollars and sells in pounds this is the single most
 * consulted figure, and it moves fast enough that a stale one is a pricing error. So
 * the latest rate is the header rather than a row you have to find.
 *
 * THERE IS NO DETAIL SCREEN because there is no route for one: GET
 * /exchange-rate/<uuid> answers 405. The blueprint has list, latest, create, update,
 * delete, pull and backfill — reading one record by id is simply not offered, so the
 * rows are terminal and carry everything worth showing.
 *
 * The trend is drawn from the same list request rather than a second endpoint. Rows
 * come back newest-first, so they are reversed before plotting — otherwise the line
 * runs backwards and looks like the currency strengthened.
 *
 * A caveat this screen cannot fix: the whole module is denied to the field roles who
 * would most like it. `sales` and `driver` get 403 on the list, on /latest and on
 * create, so a rep quoting in dollars still cannot see the rate. That is a permission
 * decision in the backend, not something to work around here.
 */
export default function ExchangeRatesScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { t, tef } = useLanguage();
  const [latest, setLatest] = useState<Rate | null>(null);
  const [trend, setTrend] = useState<Rate[]>([]);
  const [noRate, setNoRate] = useState(false);

  const load = useCallback(async () => {
    const [latestRes, trendRes] = await Promise.all([
      apiCall<Rate>('/exchange-rate/latest'),
      apiCall<{ exchange_rates: Rate[] }>(
        `/exchange-rate/?from_currency=USD&to_currency=SYP&per_page=${TREND_POINTS}`,
      ),
    ]);
    // 404 here means "no rate recorded yet", which is a state, not a failure
    if (isOk(latestRes.status) && latestRes.data) setLatest(latestRes.data);
    else setNoRate(true);
    if (isOk(trendRes.status)) setTrend(trendRes.data?.exchange_rates ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const series = useMemo(() => {
    // newest-first from the API; plotted oldest-first or the line reads backwards
    const points = trend
      .slice()
      .reverse()
      .map((r) => ({
        label: r.rate_date?.slice(5) ?? '',
        value: Number(r.rate ?? 0),
      }))
      .filter((p) => p.value > 0);
    return points.length > 1 ? [{ name: 'USD→SYP', points }] : [];
  }, [trend]);

  const header = (
    <View style={styles.header}>
      <View style={styles.latestCard}>
        <ThemedText style={styles.latestLabel}>{t('exchangeRates.latest')}</ThemedText>
        {noRate ? (
          <ThemedText style={styles.none}>{t('exchangeRates.none')}</ThemedText>
        ) : (
          <>
            <ThemedText style={styles.latestValue} numberOfLines={1}>
              {num(latest?.rate)}
            </ThemedText>
            <ThemedText style={styles.latestMeta}>
              {latest
                ? `${latest.from_currency} → ${latest.to_currency}` +
                  (latest.rate_date
                    ? ` · ${formatNumericDate(new Date(latest.rate_date))}`
                    : '') +
                  (latest.source ? ` · ${tef(latest.source)}` : '')
                : ''}
            </ThemedText>
            {(latest?.buy_rate != null || latest?.sell_rate != null) && (
              <ThemedText style={styles.latestMeta}>
                {t('exchangeRates.buySell', {
                  buy: num(latest?.buy_rate),
                  sell: num(latest?.sell_rate),
                })}
              </ThemedText>
            )}
          </>
        )}
      </View>

      {!!series.length && (
        <View style={styles.chartCard}>
          <ThemedText style={styles.chartTitle}>{t('exchangeRates.trend')}</ThemedText>
          <LineChart series={series} width={width - 72} />
        </View>
      )}
    </View>
  );

  return (
    <ModuleListScreen<Rate>
      module="exchange-rates"
      title={t('menu.exchangeRates')}
      endpoint="/exchange-rate/"
      itemsKey="exchange_rates"
      header={header}
      filters={[
        { id: 'sp-today', label: t('exchangeRates.scraped'), params: { source: 'sp-today' } },
        { id: 'manual', label: t('exchangeRates.manual'), params: { source: 'manual' } },
      ]}
      // cast for the same reason handleMenuPress does: expo-router's route union is
      // generated by Metro, so a route added since the last bundle is not in the type yet
      onCreate={() => router.push('/exchange-rates/create' as never)}
      keyExtractor={(r) => r.uuid}
      renderItem={(r) => (
        // no detail route exists (405), so a row is terminal rather than tappable
        <View style={styles.row}>
          <View style={styles.rowLeft}>
            <ThemedText style={styles.rate}>{num(r.rate)}</ThemedText>
            <ThemedText style={styles.pair}>
              {r.from_currency} → {r.to_currency}
              {r.source ? ` · ${tef(r.source)}` : ''}
            </ThemedText>
          </View>
          <ThemedText style={styles.date}>
            {r.rate_date ? formatNumericDate(new Date(r.rate_date)) : ''}
          </ThemedText>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  header: { gap: 12, marginBottom: 14 },
  latestCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  latestLabel: { fontSize: 12, opacity: 0.6 },
  // explicit lineHeight: RN clips a large glyph's ascender without it
  latestValue: { fontSize: 30, lineHeight: 38, fontWeight: '700', color: '#1f2937', marginTop: 2 },
  latestMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  none: { fontSize: 15, opacity: 0.6, marginTop: 6 },
  chartCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  chartTitle: { fontSize: 13, fontWeight: '600', opacity: 0.75, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowLeft: { flex: 1 },
  rate: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  pair: { fontSize: 12, opacity: 0.55, marginTop: 2 },
  date: { fontSize: 11, opacity: 0.5 },
});
