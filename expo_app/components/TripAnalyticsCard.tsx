import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { ThemedText } from '@/components/ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';

// Analytics for one trip, computed from /trip/<uuid>/activity — the app
// counterpart of the web Analytics tab: stop-outcome donut, revenue per
// material bars, delivered quantities.

interface ActivityStop {
  status?: string | null;
  outcome?: string | null;
}
interface ActivityOrderItem {
  material_name?: string | null;
  quantity?: number | null;
  amount?: number | null;
}
interface ActivityOrder {
  total?: number | null;
  currency?: string | null;
  is_paid?: boolean;
  items?: ActivityOrderItem[];
}
interface ActivityFulfillment {
  material_name?: string | null;
  quantity?: number | null;
}
export interface TripAnalyticsActivity {
  stops?: ActivityStop[];
  orders?: ActivityOrder[];
  fulfillments?: ActivityFulfillment[];
}

const PALETTE = ['#16a34a', '#5469D4', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#db2777'];

const outcomeLabel = (outcome: string) => {
  const i = outcome.indexOf(' - ');
  return i === -1 ? outcome : outcome.slice(i + 3);
};

const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

// donut arc path for a slice [startFrac, endFrac) of the circle
const arcPath = (cx: number, cy: number, r: number, startFrac: number, endFrac: number) => {
  const a0 = 2 * Math.PI * startFrac - Math.PI / 2;
  const a1 = 2 * Math.PI * endFrac - Math.PI / 2;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const large = endFrac - startFrac > 0.5 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
};

export function TripAnalyticsCard({ activity }: { activity?: TripAnalyticsActivity | null }) {
  const { t } = useLanguage();
  const stops = activity?.stops || [];
  const orders = activity?.orders || [];
  const fulfillments = activity?.fulfillments || [];

  const { outcomes, counts, revenueByMaterial, qtyByMaterial } = useMemo(() => {
    const outcomeCounts: Record<string, number> = {};
    for (const s of stops) {
      const key = s.outcome ? outcomeLabel(s.outcome) : t('trips.noOutcome');
      outcomeCounts[key] = (outcomeCounts[key] || 0) + 1;
    }
    const outcomes = Object.entries(outcomeCounts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const counts = {
      stops: stops.length,
      completed: stops.filter((s) => s.status === 'completed').length,
      sales: stops.filter((s) => s.outcome?.startsWith('sale')).length,
      orders: orders.length,
      unpaid: orders.filter((o) => !o.is_paid).length,
    };

    const revenueByMaterial: Record<string, Record<string, number>> = {};
    for (const o of orders) {
      const cur = o.currency || '?';
      for (const item of o.items || []) {
        if (item.amount == null) continue;
        const mat = item.material_name || '?';
        (revenueByMaterial[cur] ||= {})[mat] = (revenueByMaterial[cur][mat] || 0) + item.amount;
      }
    }

    const qtyByMaterial: Record<string, number> = {};
    for (const f of fulfillments) {
      const mat = f.material_name || '?';
      qtyByMaterial[mat] = (qtyByMaterial[mat] || 0) + (f.quantity || 0);
    }

    return { outcomes, counts, revenueByMaterial, qtyByMaterial };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, orders, fulfillments]);

  const total = outcomes.reduce((s, o) => s + o.value, 0);
  const currencies = Object.entries(revenueByMaterial);
  const qtyRows = Object.entries(qtyByMaterial).sort(([, a], [, b]) => b - a);

  if (!stops.length && !orders.length) return null;

  // donut slices
  let acc = 0;
  const slices = outcomes.map((o, i) => {
    const start = total ? acc / total : 0;
    acc += o.value;
    const end = total ? acc / total : 0;
    return { ...o, start, end, color: PALETTE[i % PALETTE.length] };
  });

  return (
    <View style={styles.card}>
      <ThemedText style={styles.cardTitle}>{t('trips.analytics')}</ThemedText>

      {/* counters */}
      <View style={styles.chipsRow}>
        <Chip label={t('trips.chipStops', { count: counts.stops })} />
        <Chip label={t('trips.chipCompleted', { count: counts.completed })} />
        <Chip label={t('trips.chipSales', { count: counts.sales })} />
        <Chip
          label={t('trips.chipUnpaid', { count: counts.unpaid })}
          warn={counts.unpaid > 0}
        />
      </View>

      {/* stop outcomes donut */}
      {total > 0 && (
        <View style={styles.donutRow}>
          <Svg width={120} height={120}>
            <G>
              {slices.length === 1 ? (
                <Circle
                  cx={60}
                  cy={60}
                  r={44}
                  stroke={slices[0].color}
                  strokeWidth={22}
                  fill="none"
                />
              ) : (
                slices.map((s, i) => (
                  <Path
                    key={i}
                    d={arcPath(60, 60, 44, s.start, Math.max(s.start, s.end - 0.004))}
                    stroke={s.color}
                    strokeWidth={22}
                    fill="none"
                  />
                ))
              )}
            </G>
          </Svg>
          <View style={styles.legend}>
            {slices.map((s, i) => (
              <View key={i} style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                <ThemedText style={styles.legendText} numberOfLines={1}>
                  {s.name}
                </ThemedText>
                <ThemedText style={styles.legendCount}>{s.value}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* revenue per material */}
      {currencies.length > 0 && (
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>{t('trips.revenuePerMaterial')}</ThemedText>
          {currencies.map(([cur, byMat]) => {
            const rows = Object.entries(byMat).sort(([, a], [, b]) => b - a);
            const max = rows[0]?.[1] || 1;
            return (
              <View key={cur} style={{ marginTop: 4 }}>
                {currencies.length > 1 && (
                  <ThemedText style={styles.currencyLabel}>{cur}</ThemedText>
                )}
                {rows.map(([mat, amount]) => (
                  <View key={mat} style={styles.barRow}>
                    <View style={styles.barMeta}>
                      <ThemedText style={styles.barName} numberOfLines={1}>
                        {mat}
                      </ThemedText>
                      <ThemedText style={styles.barValue}>
                        {fmtNum(amount)} {cur}
                      </ThemedText>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${(amount / max) * 100}%` }]} />
                    </View>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      )}

      {/* delivered quantities */}
      {qtyRows.length > 0 && (
        <View style={styles.section}>
          <ThemedText style={styles.sectionTitle}>{t('trips.deliveredQty')}</ThemedText>
          {qtyRows.map(([mat, qty]) => (
            <View key={mat} style={styles.qtyRow}>
              <ThemedText style={styles.barName} numberOfLines={1}>
                {mat}
              </ThemedText>
              <ThemedText style={styles.qtyValue}>{fmtNum(qty)}</ThemedText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Chip({ label, warn }: { label: string; warn?: boolean }) {
  return (
    <View style={[styles.chip, warn && styles.chipWarn]}>
      <ThemedText style={[styles.chipText, warn && styles.chipTextWarn]}>{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.06)',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  chipWarn: { backgroundColor: '#FEE2E2' },
  chipText: { fontSize: 11, fontWeight: '600', color: '#4B5563' },
  chipTextWarn: { color: '#B91C1C' },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 },
  legend: { flex: 1, gap: 6 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { flex: 1, fontSize: 12, color: '#374151' },
  legendCount: { fontSize: 12, fontWeight: '700', color: '#111827' },
  section: { marginTop: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 },
  currencyLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', marginBottom: 2 },
  barRow: { marginBottom: 8 },
  barMeta: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 },
  barName: { fontSize: 12, color: '#374151', flexShrink: 1, marginRight: 8 },
  barValue: { fontSize: 12, fontWeight: '700', color: '#111827' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: '#F3F4F6', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#5469D4' },
  qtyRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  qtyValue: { fontSize: 12, fontWeight: '700', color: '#111827' },
});
