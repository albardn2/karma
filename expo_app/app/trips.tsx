import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { NativeHeader } from '@/components/layout/NativeHeader';
import { apiCall } from '@/utils/api';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatMonthDayTime } from '@/utils/date';

// Admin-only Trips module — mirrors the web trips list (plate, assignee,
// status, times), newest first, with status filter chips and paging.

interface Trip {
  uuid: string;
  status: string;
  vehicle_plate?: string | null;
  assigned_username?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  created_at: string;
  notes?: string | null;
}

const STATUS_FILTERS = [
  { value: 'all', labelKey: 'trips.filterAll' },
  { value: 'planned', labelKey: 'trips.filterPlanned' },
  { value: 'in_progress', labelKey: 'trips.filterInProgress' },
  { value: 'completed', labelKey: 'trips.filterCompleted' },
  { value: 'cancelled', labelKey: 'trips.filterCancelled' },
];

export const STATUS_BADGE: Record<string, { bg: string; fg: string; labelKey: string }> = {
  planned: { bg: '#DBEAFE', fg: '#1D4ED8', labelKey: 'trips.statusPlanned' },
  in_progress: { bg: '#FEF3C7', fg: '#B45309', labelKey: 'trips.statusInProgress' },
  completed: { bg: '#D1FAE5', fg: '#047857', labelKey: 'trips.statusCompleted' },
  cancelled: { bg: '#FEE2E2', fg: '#B91C1C', labelKey: 'trips.statusCancelled' },
};

const toDate = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
  return isNaN(d.getTime()) ? null : d;
};
const fmt = (s?: string | null) => {
  const d = toDate(s);
  return d ? formatMonthDayTime(d) : '—';
};

const PER_PAGE = 20;

export default function TripsScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { isAdmin } = useAuth();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPage = useCallback(
    async (pageNum: number, replace: boolean) => {
      const status = statusFilter === 'all' ? '' : `&status=${statusFilter}`;
      const res = await apiCall<{ items: Trip[]; pages: number }>(
        `/trip/?page=${pageNum}&per_page=${PER_PAGE}${status}`
      );
      if (res.data) {
        setPages(res.data.pages || 1);
        setTrips((prev) => (replace ? res.data!.items : [...prev, ...res.data!.items]));
      }
    },
    [statusFilter]
  );

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    setPage(1);
    fetchPage(1, true).finally(() => setLoading(false));
  }, [fetchPage, isAdmin]);

  const loadMore = async () => {
    if (loadingMore || loading || page >= pages) return;
    setLoadingMore(true);
    const next = page + 1;
    await fetchPage(next, false);
    setPage(next);
    setLoadingMore(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setPage(1);
    await fetchPage(1, true);
    setRefreshing(false);
  };

  // hard gate: this module is admins-only (menu also hides it)
  if (!isAdmin) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <NativeHeader title={t('trips.title')} onBack={() => router.back()} />
        <View style={styles.centered}>
          <ThemedText style={styles.emptyText}>{t('trips.adminsOnly')}</ThemedText>
        </View>
      </ThemedView>
    );
  }

  const renderTrip = ({ item }: { item: Trip }) => {
    const badge = STATUS_BADGE[item.status] || { bg: '#E5E7EB', fg: '#4B5563', labelKey: '' };
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push({ pathname: '/trips/[uuid]', params: { uuid: item.uuid } })}
        activeOpacity={0.75}
        testID={`trip-row-${item.uuid}`}
      >
        <View style={styles.cardTop}>
          <ThemedText style={styles.plate} numberOfLines={1}>
            {item.vehicle_plate || item.uuid.slice(0, 8)}
          </ThemedText>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <ThemedText style={[styles.badgeText, { color: badge.fg }]}>
              {badge.labelKey ? t(badge.labelKey) : item.status}
            </ThemedText>
          </View>
        </View>
        <View style={styles.cardRow}>
          <ThemedText style={styles.metaLabel}>{t('trips.assigned')}</ThemedText>
          <ThemedText style={styles.metaValue}>{item.assigned_username || '—'}</ThemedText>
        </View>
        <View style={styles.cardRow}>
          <ThemedText style={styles.metaLabel}>{t('trips.start')}</ThemedText>
          <ThemedText style={styles.metaValue}>{fmt(item.start_time)}</ThemedText>
        </View>
        <View style={styles.cardRow}>
          <ThemedText style={styles.metaLabel}>{t('trips.created')}</ThemedText>
          <ThemedText style={styles.metaValue}>{fmt(item.created_at)}</ThemedText>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeHeader
        title={t('trips.title')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/?tab=menu'))}
      />

      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.value}
            style={[styles.filterChip, statusFilter === f.value && styles.filterChipActive]}
            onPress={() => setStatusFilter(f.value)}
            testID={`trips-filter-${f.value}`}
          >
            <ThemedText
              style={[styles.filterText, statusFilter === f.value && styles.filterTextActive]}
            >
              {t(f.labelKey)}
            </ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#5469D4" />
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.uuid}
          renderItem={renderTrip}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color="#5469D4" /> : null
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <ThemedText style={styles.emptyText}>{t('trips.empty')}</ThemedText>
            </View>
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: '#6B7280' },
  filterRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
  },
  filterChip: {
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
  },
  filterChipActive: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#4B5563' },
  filterTextActive: { color: '#fff' },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.06)',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  plate: { fontSize: 16, fontWeight: '700', color: '#111827', flexShrink: 1 },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  metaLabel: { fontSize: 12, color: '#9CA3AF' },
  metaValue: { fontSize: 12, fontWeight: '600', color: '#374151' },
});
