import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { apiCall } from '@/utils/api';
import { useLanguage } from '@/contexts/LanguageContext';

// Cash and stock rolled up over the trips selected in the list. Same endpoint
// and same vocabulary as the web summary, laid out for a phone: cash as a block
// per currency (like the trip detail screen), stock as a five-column table
// matching that screen's reconciliation, with variance on its own line rather
// than a sixth column that would not fit.

interface CashRow {
  currency: string;
  collected: number;
  expenses: number;
  net: number;
}

interface MaterialRow {
  material_uuid: string;
  material_name?: string | null;
  measure_unit?: string | null;
  loaded: number;
  sold: number;
  returned: number;
  net_change: number;
  variance: number;
  net_change_partial: boolean;
}

interface Summary {
  trip_count: number;
  trip_uuids: string[];
  cash: CashRow[];
  materials: MaterialRow[];
  missing_uuids: string[];
  trips_without_end_inventory: string[];
}

// 3 dp, matching what the endpoint rounds to — at 2 a real 0.001 variance
// would be flagged as nonzero and then printed as "-0"
const fmtNum = (n: number) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 3 });
const fmtMoney = (n: number) => Number(n).toFixed(2);

export function TripSummarySheet({
  visible,
  tripUuids,
  onClose,
}: {
  visible: boolean;
  tripUuids: string[];
  onClose: () => void;
}) {
  const { t, te } = useLanguage();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const key = tripUuids.join(',');
  // Which request is the current one. The roll-up walks every stop server-side,
  // so a big selection can take seconds; closing the sheet does not cancel it
  // (apiCall has no abort), and this component stays mounted across a close, so
  // its state survives. Without this counter a slow answer for an old selection
  // lands last and paints ITS cash and stock under the new selection's heading —
  // wrong numbers, presented as a reconciliation, with nothing to correct them.
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    // drop the previous selection's numbers before fetching: the header falls
    // back to the requested count, so it cannot show a stale "across 2 trips"
    // while five are loading
    setSummary(null);
    const res = await apiCall<Summary>(`/trip/summary?trip_uuids=${encodeURIComponent(key)}`);
    // superseded: a newer selection is already loading or shown — say nothing
    if (requestRef.current !== request) return;
    if (res.data) {
      setSummary(res.data);
      setError(null);
    } else {
      // never leave the previous selection's numbers on screen under a new title
      setSummary(null);
      setError(res.error || t('trips.summaryFailedShort'));
    }
    setLoading(false);
  }, [key, t]);

  useEffect(() => {
    if (!visible || !key) return;
    load();
  }, [visible, key, load]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdropWrap}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.title}>{t('trips.summaryTitle')}</ThemedText>
              <ThemedText style={styles.subtitle}>
                {t('trips.summarySubtitle', {
                  count: String(summary?.trip_count ?? tripUuids.length),
                })}
              </ThemedText>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} testID="trip-summary-close">
              <ThemedText style={styles.closeText}>✕</ThemedText>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.centered} testID="trip-summary-loading">
              <ActivityIndicator size="large" color="#5469D4" />
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <ThemedText style={styles.errorText} testID="trip-summary-error">
                {error}
              </ThemedText>
              <TouchableOpacity style={styles.retryBtn} onPress={load}>
                <ThemedText style={styles.retryText}>{t('trips.summaryRetry')}</ThemedText>
              </TouchableOpacity>
            </View>
          ) : !summary ? null : (
            <ScrollView contentContainerStyle={styles.body}>
              {/* anything that makes the totals cover less than the selection is
                  said out loud rather than left to be noticed */}
              {summary.missing_uuids.length > 0 && (
                <View style={styles.warn} testID="trip-summary-missing">
                  <ThemedText style={styles.warnText}>
                    {t('trips.summaryMissing', { count: String(summary.missing_uuids.length) })}
                  </ThemedText>
                </View>
              )}
              {summary.trips_without_end_inventory.length > 0 && (
                <View style={styles.warn} testID="trip-summary-open-trips">
                  <ThemedText style={styles.warnText}>
                    {t('trips.summaryNoEndSnapshot', {
                      count: String(summary.trips_without_end_inventory.length),
                    })}
                  </ThemedText>
                </View>
              )}

              {/* cash, per currency — never summed across them */}
              <ThemedText style={styles.sectionTitle}>{t('trips.expectedCash')}</ThemedText>
              {summary.cash.length === 0 ? (
                <ThemedText style={styles.emptyText} testID="trip-summary-cash-empty">
                  {t('trips.summaryNoCash')}
                </ThemedText>
              ) : (
                summary.cash.map((row) => (
                  <View
                    key={row.currency}
                    style={styles.cashBlock}
                    testID={`summary-cash-${row.currency}`}
                  >
                    <ThemedText style={styles.cashCurrency}>{te(row.currency)}</ThemedText>
                    <SheetRow
                      label={t('trips.cashCollected')}
                      value={fmtMoney(row.collected)}
                    />
                    {row.expenses !== 0 && (
                      <SheetRow
                        label={t('trips.tripSpend')}
                        value={`- ${fmtMoney(row.expenses)}`}
                        tone="#B45309"
                      />
                    )}
                    <SheetRow
                      label={t('trips.shouldReturn')}
                      value={fmtMoney(row.net)}
                      bold
                      tone={row.net < 0 ? '#DC2626' : undefined}
                    />
                  </View>
                ))
              )}

              {/* stock, per material */}
              <ThemedText style={[styles.sectionTitle, { marginTop: 18 }]}>
                {t('trips.summaryNetInventory')}
              </ThemedText>
              {summary.materials.length === 0 ? (
                <ThemedText style={styles.emptyText} testID="trip-summary-materials-empty">
                  {t('trips.summaryNoMaterials')}
                </ThemedText>
              ) : (
                <>
                  <View style={styles.tableHead}>
                    <ThemedText style={[styles.headCell, { flex: 2.2, textAlign: 'left' }]}>
                      {t('trips.material')}
                    </ThemedText>
                    <ThemedText style={styles.headCell}>{t('trips.summaryLoaded')}</ThemedText>
                    <ThemedText style={styles.headCell}>{t('trips.reconSold')}</ThemedText>
                    <ThemedText style={styles.headCell}>{t('trips.summaryReturned')}</ThemedText>
                    <ThemedText style={styles.headCell}>{t('trips.summaryNetChange')}</ThemedText>
                  </View>
                  {summary.materials.map((row) => (
                    <View key={row.material_uuid} testID={`summary-material-${row.material_uuid}`}>
                      <View style={styles.tableRow}>
                        <ThemedText
                          // a real name plus its unit does not fit one line on a
                          // phone; wrap rather than truncate the thing being counted
                          style={[styles.cell, { flex: 2.2, textAlign: 'left' }]}
                          numberOfLines={2}
                        >
                          {row.material_name || row.material_uuid.slice(0, 8)}
                          {/* through te(), like the currency — ENUM_AR has kg -> كغ */}
                          {row.measure_unit ? ` (${te(row.measure_unit)})` : ''}
                        </ThemedText>
                        <ThemedText style={styles.cell}>{fmtNum(row.loaded)}</ThemedText>
                        <ThemedText style={styles.cell}>{fmtNum(row.sold)}</ThemedText>
                        <ThemedText style={styles.cell}>{fmtNum(row.returned)}</ThemedText>
                        <ThemedText
                          style={[
                            styles.cell,
                            styles.netCell,
                            row.net_change < 0 && { color: '#DC2626' },
                            row.net_change > 0 && { color: '#047857' },
                          ]}
                        >
                          {row.net_change > 0 ? '+' : ''}
                          {fmtNum(row.net_change)}
                          {row.net_change_partial ? ' *' : ''}
                        </ThemedText>
                      </View>
                      {/* variance gets its own line instead of a sixth column
                          that would not fit a phone, and only when it is real */}
                      {row.variance !== 0 && (
                        <View style={styles.varianceLine}>
                          <ThemedText style={styles.varianceLabel}>
                            {t('trips.reconVariance')}
                          </ThemedText>
                          {/* its own Text: a sign glued to a translated label in
                              one string lets bidi reorder it under RTL */}
                          <ThemedText style={styles.varianceValue}>
                            {row.variance > 0 ? '+' : ''}{fmtNum(row.variance)}
                          </ThemedText>
                        </View>
                      )}
                    </View>
                  ))}
                  <ThemedText style={styles.hint}>{t('trips.summaryNetChangeHint')}</ThemedText>
                  {summary.materials.some((m) => m.net_change_partial) && (
                    <ThemedText style={styles.hint}>* {t('trips.summaryPartialHint')}</ThemedText>
                  )}
                </>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function SheetRow({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: string;
}) {
  return (
    <View style={styles.rowBetween}>
      <ThemedText style={styles.rowLabel}>{label}</ThemedText>
      <ThemedText
        style={[styles.rowValue, bold && { fontWeight: '800' }, tone ? { color: tone } : null]}
      >
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdropWrap: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    paddingBottom: 28,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 17, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  closeBtn: { paddingHorizontal: 8, paddingVertical: 2 },
  closeText: { fontSize: 18, color: '#6B7280' },
  centered: { paddingVertical: 48, alignItems: 'center' },
  errorText: { fontSize: 13, color: '#DC2626', textAlign: 'center', paddingHorizontal: 24 },
  retryBtn: {
    marginTop: 14, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: '#5469D4',
  },
  retryText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  body: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 8 },
  warn: {
    backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10, marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#FDE68A',
  },
  warnText: { fontSize: 12, color: '#92400E', lineHeight: 17 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 8 },
  emptyText: { fontSize: 13, color: '#6B7280' },
  cashBlock: { marginBottom: 10 },
  // explicit colour: this sheet is hardcoded white, so a themed default
  // would vanish in dark mode
  cashCurrency: { fontSize: 13, fontWeight: '700', color: '#6B7280', marginBottom: 2 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  rowLabel: { fontSize: 13, color: '#6B7280' },
  rowValue: { fontSize: 13, fontWeight: '600', color: '#111827' },
  tableHead: {
    flexDirection: 'row', paddingBottom: 6,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  headCell: { flex: 1, fontSize: 10, fontWeight: '700', color: '#6B7280', textAlign: 'right' },
  tableRow: {
    flexDirection: 'row', paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6',
  },
  cell: { flex: 1, fontSize: 12, color: '#111827', textAlign: 'right' },
  netCell: { fontWeight: '800' },
  varianceLine: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 6 },
  varianceLabel: { fontSize: 11, fontWeight: '700', color: '#DC2626' },
  varianceValue: { fontSize: 11, fontWeight: '700', color: '#DC2626' },
  hint: { fontSize: 11, color: '#6B7280', marginTop: 10, lineHeight: 16 },
});
