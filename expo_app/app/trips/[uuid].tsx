import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { NativeHeader } from '@/components/layout/NativeHeader';
import { apiCall } from '@/utils/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatMonthDayTime } from '@/utils/date';
import { TripTrackingMap } from '@/components/TripTrackingMap';
import { TripAnalyticsCard } from '@/components/TripAnalyticsCard';
import type { TripMapStop } from '@/components/TripMap';
import { STATUS_BADGE } from '../trips';

// Admin-only trip detail — mirrors the web page: summary, money totals,
// stops with outcomes, activity (orders / fulfilled / paid), inventory
// reconciliation, expected cash, and the live/playback tracking view.

interface Trip {
  uuid: string;
  status: string;
  vehicle_plate?: string | null;
  assigned_username?: string | null;
  workflow_execution_uuid?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  created_at: string;
  notes?: string | null;
  expected_cash?: Record<string, number> | null;
  inventory_reconciliation?: Record<
    string,
    { start: number; sold: number; expected_end: number; actual_end: number | null; variance: number | null }
  > | null;
}

interface ActivityStop {
  uuid: string;
  customer_name?: string | null;
  status?: string | null;
  outcome?: string | null;
  coordinates?: string | null;
}
interface ActivityOrder {
  uuid: string;
  created_at?: string | null;
  customer_name?: string | null;
  total?: number | null;
  amount_due?: number | null;
  amount_paid?: number | null;
  currency?: string | null;
  is_paid?: boolean;
}
interface ActivityRow {
  created_at?: string | null;
  customer_name?: string | null;
  material_name?: string | null;
  quantity?: number | null;
  amount?: number | null;
  currency?: string | null;
}
interface TripActivity {
  stops?: ActivityStop[];
  orders?: ActivityOrder[];
  fulfillments?: ActivityRow[];
  payments?: ActivityRow[];
}

const toDate = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
  return isNaN(d.getTime()) ? null : d;
};
const fmt = (s?: string | null) => {
  const d = toDate(s);
  return d ? formatMonthDayTime(d) : '—';
};
const fmtNum = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

// stored outcomes look like "sale - تم البيع"; show the human part
const outcomeLabel = (outcome: string) => {
  const i = outcome.indexOf(' - ');
  return i === -1 ? outcome : outcome.slice(i + 3);
};

const parseLatLng = (s?: string | null): { lat: number | null; lng: number | null } => {
  if (!s) return { lat: null, lng: null };
  const [lat, lng] = s.split(',').map((p) => parseFloat(p.trim()));
  return { lat: isNaN(lat) ? null : lat, lng: isNaN(lng) ? null : lng };
};

export default function TripDetailScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const { uuid } = useLocalSearchParams<{ uuid: string }>();

  const [trip, setTrip] = useState<Trip | null>(null);
  const [activity, setActivity] = useState<TripActivity | null>(null);
  const [materials, setMaterials] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activityTab, setActivityTab] = useState<'orders' | 'fulfillments' | 'payments'>('orders');
  const [trackingOn, setTrackingOn] = useState(false);

  const load = async () => {
    const [tripRes, actRes, matRes] = await Promise.all([
      apiCall<Trip>(`/trip/${uuid}`),
      apiCall<TripActivity>(`/trip/${uuid}/activity`),
      apiCall<{ materials: { uuid: string; name: string }[] }>('/material/?page=1&per_page=100'),
    ]);
    if (tripRes.data) setTrip(tripRes.data);
    if (actRes.data) setActivity(actRes.data);
    if (matRes.data)
      setMaterials(Object.fromEntries((matRes.data.materials || []).map((m) => [m.uuid, m.name])));
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid, isAdmin]);

  // money totals per currency (same math as the web analytics tab)
  const money = useMemo(() => {
    const revenue: Record<string, number> = {};
    const collected: Record<string, number> = {};
    const debt: Record<string, number> = {};
    for (const o of activity?.orders || []) {
      const cur = o.currency || '?';
      revenue[cur] = (revenue[cur] || 0) + (o.total || 0);
      collected[cur] = (collected[cur] || 0) + (o.amount_paid || 0);
      debt[cur] = (debt[cur] || 0) + (o.amount_due || 0);
    }
    return { revenue, collected, debt };
  }, [activity]);

  const trackingStops: TripMapStop[] = useMemo(
    () =>
      (activity?.stops || []).map((s, i) => {
        const { lat, lng } = parseLatLng(s.coordinates);
        return {
          taskExecutionUuid: s.uuid,
          tripStopUuid: s.uuid,
          customerName: s.customer_name || '',
          status: s.status || '',
          lat,
          lng,
          index: i,
        };
      }),
    [activity]
  );

  const badge = STATUS_BADGE[trip?.status || ''] || { bg: '#E5E7EB', fg: '#4B5563', labelKey: '' };
  const recon = Object.entries(trip?.inventory_reconciliation || {});
  const cash = Object.entries(trip?.expected_cash || {});
  const activityRows: any[] =
    activityTab === 'orders'
      ? activity?.orders || []
      : activityTab === 'fulfillments'
      ? activity?.fulfillments || []
      : activity?.payments || [];

  if (!isAdmin) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <NativeHeader title={t('trips.title')} onBack={() => router.back()} />
        <View style={styles.centered}>
          <ThemedText style={styles.muted}>{t('trips.adminsOnly')}</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (loading || !trip) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <NativeHeader title={t('trips.title')} onBack={() => router.back()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#5469D4" />
        </View>
      </ThemedView>
    );
  }

  // full-screen tracking view (reuses the distribution tracking map)
  if (trackingOn && trip.workflow_execution_uuid) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <NativeHeader title={t('tracking.button')} onBack={() => setTrackingOn(false)} />
        <View style={{ flex: 1 }}>
          <TripTrackingMap
            executionUuid={trip.workflow_execution_uuid}
            assignedValue={trip.assigned_username || null}
            stops={trackingStops}
            onClose={() => setTrackingOn(false)}
          />
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeHeader
        title={trip.vehicle_plate || t('trips.title')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/trips'))}
        rightButton={
          trip.workflow_execution_uuid
            ? { label: t('tracking.button'), onPress: () => setTrackingOn(true) }
            : undefined
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* summary */}
        <View style={styles.card}>
          <View style={styles.rowBetween}>
            <ThemedText style={styles.cardTitle}>{t('trips.summary')}</ThemedText>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <ThemedText style={[styles.badgeText, { color: badge.fg }]}>
                {badge.labelKey ? t(badge.labelKey) : trip.status}
              </ThemedText>
            </View>
          </View>
          <Row label={t('trips.assigned')} value={trip.assigned_username || '—'} />
          <Row label={t('trips.start')} value={fmt(trip.start_time)} />
          <Row label={t('trips.end')} value={fmt(trip.end_time)} />
          {!!trip.notes && <Row label={t('trips.notes')} value={trip.notes} />}
        </View>

        {/* money totals */}
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>{t('trips.money')}</ThemedText>
          <MoneyRow label={t('trips.revenue')} totals={money.revenue} />
          <MoneyRow label={t('trips.collected')} totals={money.collected} />
          <MoneyRow label={t('trips.debt')} totals={money.debt} highlightNonZero />
        </View>

        {/* analytics */}
        <TripAnalyticsCard activity={activity} />

        {/* expected cash */}
        {cash.length > 0 && (
          <View style={styles.card}>
            <ThemedText style={styles.cardTitle}>{t('trips.expectedCash')}</ThemedText>
            {cash.map(([cur, amt]) => (
              <Row key={cur} label={cur} value={fmtNum(amt)} />
            ))}
          </View>
        )}

        {/* stops with outcomes */}
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>
            {t('trips.stops', { count: activity?.stops?.length ?? 0 })}
          </ThemedText>
          {(activity?.stops || []).length === 0 ? (
            <ThemedText style={styles.muted}>{t('trips.noStops')}</ThemedText>
          ) : (
            (activity?.stops || []).map((s, i) => (
              <View key={s.uuid} style={styles.stopRow}>
                <ThemedText style={styles.stopName} numberOfLines={1}>
                  {i + 1}. {s.customer_name || '—'}
                </ThemedText>
                <ThemedText style={styles.stopOutcome} numberOfLines={1}>
                  {s.outcome ? outcomeLabel(s.outcome) : t('trips.noOutcome')}
                </ThemedText>
              </View>
            ))
          )}
        </View>

        {/* activity */}
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>{t('trips.activity')}</ThemedText>
          <View style={styles.tabRow}>
            {(['orders', 'fulfillments', 'payments'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[styles.tabChip, activityTab === tab && styles.tabChipActive]}
                onPress={() => setActivityTab(tab)}
                testID={`trip-activity-tab-${tab}`}
              >
                <ThemedText style={[styles.tabText, activityTab === tab && styles.tabTextActive]}>
                  {t(`trips.tab_${tab}`)}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
          {activityRows.length === 0 ? (
            <ThemedText style={styles.muted}>{t('trips.nothingHere')}</ThemedText>
          ) : (
            activityRows.slice(0, 25).map((r: any, i: number) => (
              <View key={i} style={styles.activityRow}>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.activityName} numberOfLines={1}>
                    {activityTab === 'fulfillments'
                      ? r.material_name || '—'
                      : r.customer_name || '—'}
                  </ThemedText>
                  <ThemedText style={styles.activityMeta}>{fmt(r.created_at)}</ThemedText>
                </View>
                <ThemedText style={styles.activityValue}>
                  {activityTab === 'orders'
                    ? `${fmtNum(r.total || 0)} ${r.currency || ''}`
                    : activityTab === 'fulfillments'
                    ? fmtNum(r.quantity || 0)
                    : `${fmtNum(r.amount || 0)} ${r.currency || ''}`}
                </ThemedText>
              </View>
            ))
          )}
        </View>

        {/* inventory reconciliation */}
        {recon.length > 0 && (
          <View style={styles.card}>
            <ThemedText style={styles.cardTitle}>{t('trips.inventory')}</ThemedText>
            <View style={styles.reconHeader}>
              <ThemedText style={[styles.reconCellHead, { flex: 2 }]}>{t('trips.material')}</ThemedText>
              <ThemedText style={styles.reconCellHead}>{t('trips.reconStart')}</ThemedText>
              <ThemedText style={styles.reconCellHead}>{t('trips.reconSold')}</ThemedText>
              <ThemedText style={styles.reconCellHead}>{t('trips.reconEnd')}</ThemedText>
              <ThemedText style={styles.reconCellHead}>{t('trips.reconVariance')}</ThemedText>
            </View>
            {recon.map(([mat, r]) => (
              <View key={mat} style={styles.reconRow}>
                <ThemedText style={[styles.reconCell, { flex: 2, textAlign: 'left' }]} numberOfLines={1}>
                  {materials[mat] || mat.slice(0, 8)}
                </ThemedText>
                <ThemedText style={styles.reconCell}>{fmtNum(r.start)}</ThemedText>
                <ThemedText style={styles.reconCell}>{fmtNum(r.sold)}</ThemedText>
                <ThemedText style={styles.reconCell}>
                  {r.actual_end == null ? '—' : fmtNum(r.actual_end)}
                </ThemedText>
                <ThemedText
                  style={[
                    styles.reconCell,
                    r.variance != null && r.variance !== 0 && { color: '#DC2626', fontWeight: '700' },
                  ]}
                >
                  {r.variance == null ? '—' : fmtNum(r.variance)}
                </ThemedText>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.rowBetween}>
      <ThemedText style={styles.rowLabel}>{label}</ThemedText>
      <ThemedText style={styles.rowValue} numberOfLines={2}>
        {value}
      </ThemedText>
    </View>
  );
}

function MoneyRow({
  label,
  totals,
  highlightNonZero,
}: {
  label: string;
  totals: Record<string, number>;
  highlightNonZero?: boolean;
}) {
  const entries = Object.entries(totals).filter(([, v]) => v !== 0);
  return (
    <View style={styles.rowBetween}>
      <ThemedText style={styles.rowLabel}>{label}</ThemedText>
      <ThemedText
        style={[
          styles.rowValue,
          highlightNonZero && entries.length > 0 && { color: '#DC2626', fontWeight: '700' },
        ]}
      >
        {entries.length === 0 ? '0' : entries.map(([c, v]) => `${fmtNum(v)} ${c}`).join(' · ')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.06)',
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 8 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  rowLabel: { fontSize: 13, color: '#6B7280' },
  rowValue: { fontSize: 13, fontWeight: '600', color: '#111827', flexShrink: 1, textAlign: 'right' },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  muted: { fontSize: 13, color: '#9CA3AF', paddingVertical: 8, textAlign: 'center' },
  stopRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  stopName: { fontSize: 13, fontWeight: '600', color: '#111827', flex: 1, marginRight: 10 },
  stopOutcome: { fontSize: 12, color: '#6B7280', maxWidth: '45%' },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  tabChip: {
    borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#F3F4F6',
  },
  tabChipActive: { backgroundColor: '#5469D4' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#4B5563' },
  tabTextActive: { color: '#fff' },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  activityName: { fontSize: 13, fontWeight: '600', color: '#111827' },
  activityMeta: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
  activityValue: { fontSize: 13, fontWeight: '700', color: '#111827', marginLeft: 10 },
  reconHeader: { flexDirection: 'row', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  reconCellHead: { flex: 1, fontSize: 11, fontWeight: '700', color: '#6B7280', textAlign: 'right' },
  reconRow: {
    flexDirection: 'row', paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  reconCell: { flex: 1, fontSize: 12, color: '#111827', textAlign: 'right' },
});
