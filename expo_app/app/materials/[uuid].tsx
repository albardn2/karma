import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { LineChart } from '@/components/Chart';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { formatMonthDayTime, formatNumericDate, plainDate } from '@/utils/date';

interface Material {
  uuid: string;
  name: string;
  sku?: string | null;
  measure_unit?: string | null;
  type?: string | null;
  description?: string | null;
  created_at: string;
}

interface SummaryLot {
  uuid: string;
  lot_id: string;
  warehouse_name?: string | null;
  current_quantity: number;
  unit?: string | null;
  cost_per_unit?: number | null;
  currency?: string | null;
  created_at?: string | null;
  expiration_date?: string | null;
}

interface Summary {
  /** oldest-first stock movements; quantities are signed */
  events: Array<{ t: string; quantity: number }>;
  lots: SummaryLot[];
}

/** Naive backend timestamps are UTC — parse them as such, or the time shifts. */
const parseTs = (s: string) => new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');

/**
 * A material: what it is, where its stock sits, how the level moved, and the writes
 * the web offers — delete, add stock, zero a lot out.
 *
 * The stock data comes from ONE call, /material/<uuid>/inventory-summary, which the
 * server computes: lots with their warehouse names already joined, costs converted
 * into a single reporting currency, exactly-zero lots hidden, and the full event
 * series. The previous version reassembled this client-side from a page of /inventory/
 * and a page of /warehouse/ — both capped at 100, so a large tenant's stock silently
 * truncated, and a warehouse past the first page rendered as "unknown".
 *
 * Quantities ARE summed here, unlike on the warehouse screen — every lot of one
 * material shares that material's unit, so a total is meaningful. Across materials it
 * would not be, which is why the warehouse screen refuses to.
 *
 * The weighted-average cost covers only lots that carry a cost, and the screen says
 * how many do not. All costs arrive converted into the chosen reporting currency, so
 * one figure is legal — it is a conversion, not a cross-currency sum.
 *
 * Negative lots render red rather than being filtered: they are real (an over-issued
 * lot), and zero-out is exactly the corrective action for them — it writes the delta
 * the server computes, so a stale screen cannot overshoot.
 */
export default function MaterialDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const { t, tef } = useLanguage();
  const { width } = useWindowDimensions();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ccy, setCcy] = useState<'USD' | 'SYP'>('USD');
  const [reloadKey, setReloadKey] = useState(0);

  const loadSummary = useCallback(
    async (currency: 'USD' | 'SYP') => {
      // cost_currency is a reporting currency, not a filter: every lot's cost is
      // converted server-side at the rate nearest its own events
      const res = await apiCall<Summary>(
        `/material/${uuid}/inventory-summary?cost_currency=${currency}`,
      );
      // keep the previous numbers on a failed refetch rather than blanking a section
      // that had data a second ago
      if (isOk(res.status) && res.data) setSummary(res.data);
      else if (!summary) setSummary({ events: [], lots: [] });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uuid],
  );

  // focus, not mount: add-stock and zero-out both change what this screen shows, and
  // returning from the add-stock screen must show the new lot
  useFocusEffect(
    useCallback(() => {
      loadSummary(ccy);
      // also refresh the material record itself: returning from the edit screen must
      // show the new name/sku, and a stack pop does not remount this screen. One bump
      // per focus event — setState does not re-trigger focus, so this cannot loop.
      setReloadKey((k) => k + 1);
    }, [loadSummary, ccy]),
  );

  const lots = summary?.lots ?? null;
  const onHand = (lots ?? []).reduce((n, l) => n + Number(l.current_quantity ?? 0), 0);
  const priced = (lots ?? []).filter(
    (l) => l.cost_per_unit != null && Number(l.current_quantity ?? 0) > 0,
  );
  const pricedQty = priced.reduce((n, l) => n + Number(l.current_quantity), 0);
  const weighted =
    pricedQty > 0
      ? priced.reduce((n, l) => n + Number(l.current_quantity) * Number(l.cost_per_unit), 0) /
        pricedQty
      : null;
  const unpricedCount = (lots ?? []).filter(
    (l) => l.cost_per_unit == null && Number(l.current_quantity ?? 0) > 0,
  ).length;
  const qty = (n: number) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));

  // the chart series: a running level, cumulated client-side from the signed events
  const series = (() => {
    const ev = summary?.events ?? [];
    let level = 0;
    return [
      {
        name: t('materials.stockOverTime'),
        points: ev.map((e) => {
          level += Number(e.quantity ?? 0);
          return { label: formatMonthDayTime(parseTs(e.t)), value: level };
        }),
      },
    ];
  })();

  const zeroOut = (lot: SummaryLot) =>
    Alert.alert(
      t('materials.zeroOut'),
      t('materials.zeroOutConfirm', { lot: lot.lot_id }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('materials.zeroOut'),
          style: 'destructive',
          onPress: async () => {
            // the delta is computed server-side from the lot's CURRENT quantity, so a
            // stale screen cannot overshoot; a negative lot corrects upward
            const res = await apiCall(`/inventory/${lot.uuid}/zero-out`, {
              method: 'POST',
              body: JSON.stringify({}),
            });
            if (isOk(res.status)) loadSummary(ccy);
            else
              Alert.alert(
                t('materials.zeroOutFailed'),
                String(res.error ?? '').slice(0, 300) || t('form.tryAgain'),
              );
          },
        },
      ],
    );

  const removeMaterial = async (x: Material) => {
    const res = await apiCall(`/material/${x.uuid}`, { method: 'DELETE' });
    if (isOk(res.status)) {
      router.replace('/materials');
      return;
    }
    // the server's 400 says the material "cannot be updated", which is the wrong verb
    // for a delete — show this screen's own explanation instead
    if (res.status === 400) {
      Alert.alert(t('detail.delete'), t('materials.deleteBlocked'));
    } else {
      Alert.alert(
        t('materials.deleteFailed'),
        String(res.error ?? '').slice(0, 300) || t('form.tryAgain'),
      );
    }
  };

  return (
    <ModuleDetailScreen<Material>
      module="materials"
      title={t('menu.materials')}
      endpoint={`/material/${uuid}`}
      reloadKey={reloadKey}
      heading={(x) => x.name}
      rows={(x): DetailRow[] => [
        [t('materials.sku'), x.sku || '—'],
        [t('materials.unit'), x.measure_unit || '—'],
        [t('materials.type'), x.type ? tef(x.type) : '—'],
        [
          t('materials.onHand'),
          lots == null ? '…' : `${qty(onHand)}${x.measure_unit ? ` ${x.measure_unit}` : ''}`,
        ],
        [t('materials.avgCost'), weighted == null ? '—' : `${weighted.toFixed(2)} ${ccy}`],
        // parsed as UTC (append-Z): the column is naive UTC, and a bare new Date()
        // reads it as local, shifting the shown date by the viewer's offset
        [t('materials.created'), formatNumericDate(parseTs(x.created_at))],
        [t('materials.uuid'), x.uuid],
      ]}
      sections={[
        {
          title: t('materials.stockOverTime'),
          isEmpty: () => !(summary?.events ?? []).length,
          emptyText: t('materials.noEvents'),
          render: () => (
            <LineChart series={series} width={width - 72} step />
          ),
        },
        {
          title: t('materials.lots'),
          isEmpty: () => !lots?.length,
          emptyText: t('materials.noLots'),
          render: (x) => (
            <>
              {/* reporting-currency toggle: refetches with costs converted server-side */}
              <View style={styles.ccyRow}>
                {(['USD', 'SYP'] as const).map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.ccyChip, ccy === c && styles.ccyChipOn]}
                    onPress={() => setCcy(c)}
                    testID={`material-ccy-${c}`}
                  >
                    <ThemedText style={[styles.ccyText, ccy === c && styles.ccyTextOn]}>
                      {tef(c)}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
              {(lots ?? []).map((l) => {
                const value =
                  l.cost_per_unit != null
                    ? Number(l.current_quantity) * Number(l.cost_per_unit)
                    : null;
                return (
                  <View key={l.uuid} style={styles.lot}>
                    <View style={styles.lotLeft}>
                      <ThemedText style={styles.lotWarehouse} numberOfLines={1}>
                        {l.warehouse_name || t('materials.unknownWarehouse')}
                      </ThemedText>
                      <ThemedText style={styles.lotMeta} numberOfLines={1}>
                        {l.lot_id}
                        {l.cost_per_unit != null
                          ? ` · ${Number(l.cost_per_unit).toFixed(2)} ${l.currency ?? ccy}/${
                              l.unit ?? x.measure_unit ?? ''
                            }`
                          : ` · ${t('materials.noCost')}`}
                        {value != null
                          ? ` · ${t('materials.stockValue')} ${value.toFixed(2)} ${ccy}`
                          : ''}
                      </ThemedText>
                      {(l.created_at || l.expiration_date) && (
                        <ThemedText style={styles.lotMeta} numberOfLines={1}>
                          {l.created_at
                            ? `${t('inventory.received')} ${plainDate(l.created_at.slice(0, 10))}`
                            : ''}
                          {l.created_at && l.expiration_date ? ' · ' : ''}
                          {l.expiration_date
                            ? `${t('inventory.expiry')} ${plainDate(
                                l.expiration_date.slice(0, 10),
                              )}`
                            : ''}
                        </ThemedText>
                      )}
                    </View>
                    <View style={styles.lotRight}>
                      <ThemedText
                        style={[
                          styles.lotQty,
                          Number(l.current_quantity) <= 0 && styles.lotQtyBad,
                        ]}
                      >
                        {qty(Number(l.current_quantity))}
                        {l.unit ? ` ${l.unit}` : ''}
                      </ThemedText>
                      <TouchableOpacity
                        onPress={() => zeroOut(l)}
                        hitSlop={8}
                        testID={`zero-out-${l.uuid}`}
                      >
                        <ThemedText style={styles.zeroOut}>
                          {t('materials.zeroOut')}
                        </ThemedText>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
              {unpricedCount > 0 && (
                <ThemedText style={styles.note}>
                  {t('materials.unpricedNote', { count: unpricedCount })}
                </ThemedText>
              )}
            </>
          ),
        },
      ]}
      actions={[
        {
          label: t('inventory.addStock'),
          testID: 'material-add-stock',
          onPress: (x) =>
            router.push({
              pathname: '/materials/add-stock',
              params: { material_uuid: x.uuid, material_name: x.name ?? '' },
            }),
        },
        {
          label: t('detail.edit'),
          testID: 'material-edit',
          onPress: (x) =>
            router.push({
              pathname: '/materials/create',
              params: {
                uuid: x.uuid,
                name: x.name ?? '',
                sku: x.sku ?? '',
                type: x.type ?? '',
                measure_unit: x.measure_unit ?? '',
                description: x.description ?? '',
              },
            }),
        },
        {
          label: t('detail.delete'),
          destructive: true,
          confirmText: t('materials.deleteConfirm'),
          testID: 'material-delete',
          onPress: removeMaterial,
        },
      ]}
      footer={(x) =>
        x.description ? (
          <View style={styles.descBlock}>
            <ThemedText style={styles.descTitle}>{t('materials.description')}</ThemedText>
            <ThemedText style={styles.desc}>{x.description}</ThemedText>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  ccyRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  ccyChip: {
    // the trips filter-chip design
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  ccyChipOn: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  ccyText: { fontSize: 12, fontWeight: '600', color: '#4B5563' },
  ccyTextOn: { color: '#fff' },
  lot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  lotLeft: { flex: 1 },
  lotWarehouse: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  lotMeta: { fontSize: 11, opacity: 0.55, marginTop: 1 },
  lotRight: { alignItems: 'flex-end', gap: 3 },
  lotQty: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  lotQtyBad: { color: '#991b1b' },
  zeroOut: { fontSize: 12, fontWeight: '700', color: '#dc2626' },
  note: { fontSize: 11, opacity: 0.6, marginTop: 8, fontStyle: 'italic' },
  descBlock: { marginTop: 22 },
  descTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  desc: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
});
