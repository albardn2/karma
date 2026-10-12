import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  FunnelPanel,
  INTEREST_COLOURS,
  SALE_COLOURS,
  interestLabels,
  saleLabels,
  type Funnel,
} from '@/components/TagFunnel';

// The trip screen's last card: the dashboard's sales & interest funnels,
// narrowed to the customers this trip stopped at and measured over the trip
// itself — no period to pick, always the change view, plus each step's count
// from before the trip under its bar. The screen fetches the payload with the
// rest of the trip, so pull-to-refresh refreshes this too.

/** GET /trip/<uuid>/tag-funnels */
export interface TripFunnels {
  trip_uuid: string;
  /** worked stops (completed or skipped) counted, revisits included */
  stops: number;
  /** distinct live customers on those stops, today */
  total_customers: number;
  /** the same customers as of the trip's end */
  total_at_period_end: number;
  /** of them, created during the trip */
  new_customers: number;
  /** the tenant's first tag event, naive UTC ISO */
  history_from: string | null;
  /** the trip window, naive UTC ISO datetimes; is_current = still running,
   * measured to now; estimated = the trip did not record when it set off or
   * stopped working, so the window is a fallback */
  period: { start: string; end: string; is_current: boolean; estimated: boolean };
  funnels: { sale: Funnel; interest: Funnel };
}

export function TripTagFunnels({
  data,
  failed,
  onRetry,
}: {
  data: TripFunnels | null;
  failed: boolean;
  onRetry: () => void;
}) {
  const { t } = useLanguage();

  // "25 December 2025" — month names come from the translations (no Intl on
  // the native side), read off the string so no time zone can shift the day
  const dayMonthYear = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return `${d} ${t(`dashboards.tfM${m}`)} ${y}`;
  };
  // a trip that began before the tag log did cannot show all of its moves
  const historyFrom = data?.history_from?.slice(0, 10);
  const historyNote =
    data && historyFrom && data.period.start.slice(0, 10) < historyFrom
      ? t('trips.funnelsHistoryNote', { date: dayMonthYear(historyFrom) })
      : null;

  return (
    <View style={styles.card} testID="trip-funnels">
      <ThemedText style={styles.cardTitle}>{t('trips.funnelsTitle')}</ThemedText>

      {/* failed first: a refresh that fails says so rather than leaving the
          last numbers up as if they were current */}
      {failed ? (
        <View style={styles.centre} testID="trip-funnels-failed">
          <ThemedText style={styles.stateText}>{t('trips.funnelsFailed')}</ThemedText>
          <TouchableOpacity style={styles.retry} onPress={onRetry} testID="trip-funnels-retry">
            <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
          </TouchableOpacity>
        </View>
      ) : !data ? (
        <View style={styles.centre} testID="trip-funnels-loading">
          <ActivityIndicator color="#5469D4" />
        </View>
      ) : data.total_at_period_end === 0 && data.total_customers === 0 ? (
        <ThemedText style={styles.muted} testID="trip-funnels-empty">
          {t('trips.funnelsEmpty')}
        </ThemedText>
      ) : (
        <>
          <ThemedText style={styles.desc} testID="trip-funnels-desc">
            {t(data.period.is_current ? 'trips.funnelsDescOpen' : 'trips.funnelsDesc', {
              n: data.total_at_period_end,
            })}
          </ThemedText>
          {data.new_customers > 0 && (
            <ThemedText style={[styles.desc, styles.descNext]} testID="trip-funnels-new">
              {t('trips.funnelsNew', { n: data.new_customers })}
            </ThemedText>
          )}

          {/* flat inside this card, a divider between them, rather than a card
              within a card */}
          <FunnelPanel
            title={t('dashboards.tfSales')}
            testID="trip-tf-sale"
            funnel={data.funnels.sale}
            showMovement
            showBefore
            movesTitle={t('trips.funnelsMoves')}
            noMovesText={t('trips.funnelsNoMoves')}
            labels={saleLabels(t)}
            colours={SALE_COLOURS}
            outsideText={(n) => t('dashboards.tfOutsideSale', { n })}
            style={styles.panel}
          />
          <FunnelPanel
            title={t('dashboards.tfInterest')}
            testID="trip-tf-interest"
            funnel={data.funnels.interest}
            showMovement
            showBefore
            movesTitle={t('trips.funnelsMoves')}
            noMovesText={t('trips.funnelsNoMoves')}
            labels={interestLabels(t)}
            colours={INTEREST_COLOURS}
            outsideText={(n) => t('dashboards.tfOutsideInterest', { n })}
            style={styles.panel}
          />

          {data.period.estimated && (
            <ThemedText style={styles.caveat} testID="trip-funnels-estimated">
              {t('trips.funnelsEstimated')}
            </ThemedText>
          )}
          {historyNote && (
            <ThemedText style={styles.caveat} testID="trip-funnels-history-note">
              {historyNote}
            </ThemedText>
          )}
          <ThemedText style={styles.hint} testID="trip-funnels-hint">
            {t('trips.funnelsHint')}
          </ThemedText>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // the trip screen's card
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.06)',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  desc: { fontSize: 13, color: '#4B5563', lineHeight: 18 },
  descNext: { marginTop: 4 },
  panel: {
    backgroundColor: 'transparent', borderRadius: 0, padding: 0, marginBottom: 0,
    marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.06)',
  },
  caveat: { fontSize: 12, color: '#B45309', lineHeight: 17, marginTop: 12 },
  hint: { fontSize: 11, color: '#6B7280', lineHeight: 16, marginTop: 12 },
  muted: { fontSize: 13, color: '#9CA3AF', paddingVertical: 8, textAlign: 'center' },
  centre: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 10 },
  stateText: { fontSize: 13, color: '#6B7280', textAlign: 'center' },
  retry: {
    borderRadius: 10, borderWidth: 1, borderColor: '#5469D4',
    paddingHorizontal: 14, paddingVertical: 7, alignItems: 'center',
  },
  retryText: { color: '#5469D4', fontSize: 13, fontWeight: '700' },
});
