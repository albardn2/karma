import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  I18nManager,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { NativeHeader } from '@/components/layout/NativeHeader';
import { TripSummarySheet } from '@/components/TripSummarySheet';
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
  is_audited?: boolean;
}

// 'all' means "send no is_audited param at all" — the endpoint 422s on an empty
// value, and omitting it is what returns both kinds.
const AUDIT_FILTERS = [
  { value: 'all', labelKey: 'trips.filterAll' },
  { value: 'true', labelKey: 'trips.audited' },
  { value: 'false', labelKey: 'trips.notAudited' },
];

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
// matches MAX_SUMMARY_TRIPS on the endpoint — saying so here beats a 422
const MAX_SELECTION = 100;

/** One row of filter chips that scrolls sideways instead of wrapping.
 *
 * Five status chips do not fit a phone's width, and wrapping left one chip
 * orphaned on a line of its own. A single row keeps the group readable at any
 * label length — which matters because the Arabic labels are a different width
 * again. The arrow appears only while there is something further along, and
 * taps to scroll, so the overflow is not left to be discovered by swiping.
 */
function ChipRow({
  options,
  value,
  onChange,
  testIDPrefix,
  label,
}: {
  options: { value: string; labelKey: string }[];
  value: string;
  onChange: (v: string) => void;
  testIDPrefix: string;
  label: (key: string) => string;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const geometry = useRef({ content: 0, viewport: 0, offset: 0 });
  const [hasMore, setHasMore] = useState(false);

  const recompute = () => {
    const { content, viewport, offset } = geometry.current;
    setHasMore(content - viewport - offset > 8);
  };

  return (
    <View style={styles.filterRow}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
        onContentSizeChange={(w) => {
          geometry.current.content = w;
          recompute();
        }}
        onLayout={(e) => {
          geometry.current.viewport = e.nativeEvent.layout.width;
          recompute();
        }}
        onScroll={(e) => {
          geometry.current.offset = e.nativeEvent.contentOffset.x;
          recompute();
        }}
        scrollEventThrottle={32}
      >
        {options.map((option) => {
          const active = value === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => onChange(option.value)}
              testID={`${testIDPrefix}-${option.value}`}
            >
              <ThemedText style={[styles.filterText, active && styles.filterTextActive]}>
                {label(option.labelKey)}
              </ThemedText>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      {hasMore && (
        <TouchableOpacity
          style={styles.moreButton}
          onPress={() => {
            const { viewport, offset } = geometry.current;
            scrollRef.current?.scrollTo({ x: offset + viewport * 0.7, animated: true });
          }}
          testID={`${testIDPrefix}-more`}
        >
          {/* points the way reading goes, so it flips with the layout */}
          <ThemedText style={styles.moreArrow}>{I18nManager.isRTL ? '‹' : '›'}</ThemedText>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function TripsScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const insets = useSafeAreaInsets();

  const [trips, setTrips] = useState<Trip[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [auditFilter, setAuditFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Long-press a trip to start selecting; after that a tap toggles instead of
  // opening. Kept across pages so a month can be rolled up, but dropped when a
  // filter changes — the trips on screen would no longer explain the total.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [showSummary, setShowSummary] = useState(false);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelected([]);
  }, []);

  const beginSelection = (uuid: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSelectionMode(true);
    setSelected([uuid]);
  };

  const toggleSelected = (uuid: string) => {
    // the cap message is decided out here: a state updater has to stay pure, or
    // React is free to run it twice and alert twice
    if (!selected.includes(uuid) && selected.length >= MAX_SELECTION) {
      Alert.alert(t('trips.summaryTooMany', { max: MAX_SELECTION }));
      return;
    }
    setSelected((prev) =>
      prev.includes(uuid)
        ? prev.filter((u) => u !== uuid)
        : prev.length >= MAX_SELECTION
          ? prev
          : [...prev, uuid]
    );
  };

  // unchecking the last one leaves selection mode, as a list should. Derived
  // from the selection rather than done inside the updater, for the same reason.
  useEffect(() => {
    if (selectionMode && selected.length === 0) setSelectionMode(false);
  }, [selectionMode, selected]);

  // on Android, back should leave selection rather than the screen
  useEffect(() => {
    if (!selectionMode) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      exitSelection();
      return true;
    });
    return () => sub.remove();
  }, [selectionMode, exitSelection]);

  const fetchPage = useCallback(
    async (pageNum: number, replace: boolean) => {
      const status = statusFilter === 'all' ? '' : `&status=${statusFilter}`;
      const audited = auditFilter === 'all' ? '' : `&is_audited=${auditFilter}`;
      const res = await apiCall<{ items: Trip[]; pages: number }>(
        `/trip/?page=${pageNum}&per_page=${PER_PAGE}${status}${audited}`
      );
      if (res.data) {
        setPages(res.data.pages || 1);
        setTrips((prev) => (replace ? res.data!.items : [...prev, ...res.data!.items]));
      }
    },
    [statusFilter, auditFilter]
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
    const isSelected = selected.includes(item.uuid);
    return (
      <TouchableOpacity
        style={[styles.card, selectionMode && styles.cardSelectable, isSelected && styles.cardSelected]}
        onPress={() =>
          selectionMode
            ? toggleSelected(item.uuid)
            : router.push({ pathname: '/trips/[uuid]', params: { uuid: item.uuid } })
        }
        onLongPress={() => (selectionMode ? toggleSelected(item.uuid) : beginSelection(item.uuid))}
        delayLongPress={300}
        activeOpacity={0.75}
        testID={`trip-row-${item.uuid}`}
      >
        {/* the box only takes space once selecting has started, so the normal
            list is unchanged; flexDirection flips itself under RTL */}
        {selectionMode && (
          <View style={styles.checkboxCol}>
            <View style={[styles.checkbox, isSelected && styles.checkboxOn]}>
              {isSelected && <ThemedText style={styles.checkboxTick}>✓</ThemedText>}
            </View>
          </View>
        )}
        <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <ThemedText style={styles.plate} numberOfLines={1}>
            {item.vehicle_plate || item.uuid.slice(0, 8)}
          </ThemedText>
          <View style={styles.badgeGroup}>
            {item.is_audited && (
              <View style={[styles.badge, { backgroundColor: '#D1FAE5' }]}>
                <ThemedText
                  style={[styles.badgeText, { color: '#047857' }]}
                  testID={`trip-audited-${item.uuid}`}
                >
                  {t('trips.audited')}
                </ThemedText>
              </View>
            )}
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <ThemedText style={[styles.badgeText, { color: badge.fg }]}>
                {badge.labelKey ? t(badge.labelKey) : item.status}
              </ThemedText>
            </View>
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

      <ChipRow
        options={STATUS_FILTERS}
        value={statusFilter}
        onChange={(v) => { exitSelection(); setStatusFilter(v); }}
        testIDPrefix="trips-filter"
        label={t}
      />

      <ChipRow
        options={AUDIT_FILTERS}
        value={auditFilter}
        onChange={(v) => { exitSelection(); setAuditFilter(v); }}
        testIDPrefix="trips-audit-filter"
        label={t}
      />

      {/* a long press is invisible, so say it once — and only while it is the
          thing to do */}
      {!selectionMode && !loading && trips.length > 0 && (
        <ThemedText style={styles.selectHint}>{t('trips.selectHint')}</ThemedText>
      )}

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
          // rows are re-rendered when the selection changes, not just the data
          extraData={`${selectionMode}:${selected.join(',')}`}
        />
      )}

      {/* Action bar, only while selecting — pinned under the list so the Summary
          button is in thumb reach, clear of the filter chips up top. It takes
          flow space rather than floating, so the list shrinks to fit and the
          last card stays scrollable without extra padding. */}
      {selectionMode && (
        <View
          style={[styles.actionBar, { paddingBottom: Math.max(insets.bottom, 12) }]}
          testID="trips-selection-bar"
        >
          <ThemedText style={styles.actionCount} testID="trips-selected-count">
            {t('trips.selectedCount', { count: selected.length })}
          </ThemedText>
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={exitSelection}
              testID="trips-selection-cancel"
            >
              <ThemedText style={styles.cancelText}>{t('common.cancel')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.summaryBtn, selected.length === 0 && styles.summaryBtnDisabled]}
              disabled={selected.length === 0}
              onPress={() => setShowSummary(true)}
              testID="trips-summary-button"
            >
              <ThemedText style={styles.summaryText}>{t('trips.summaryButton')}</ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <TripSummarySheet
        visible={showSummary}
        tripUuids={selected}
        onClose={() => setShowSummary(false)}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 14, color: '#6B7280' },
  filterRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  // the padding lives on the content so the first and last chip clear the edge
  filterScroll: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 },
  moreButton: { paddingHorizontal: 12, paddingVertical: 4 },
  moreArrow: { fontSize: 22, fontWeight: '700', color: '#5469D4', lineHeight: 24 },
  filterChip: {
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
  },
  filterChipActive: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  filterText: { fontSize: 12, fontWeight: '600', color: '#4B5563' },
  filterTextActive: { color: '#fff' },
  selectHint: { fontSize: 11, color: '#9CA3AF', paddingHorizontal: 16, paddingBottom: 6 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.06)',
  },
  // while selecting, the card becomes a row: box first, then the usual content
  cardSelectable: { flexDirection: 'row', alignItems: 'flex-start' },
  cardSelected: { borderColor: '#5469D4', borderWidth: 1.5, backgroundColor: '#F5F6FE' },
  cardBody: { flex: 1 },
  checkboxCol: { paddingTop: 2, paddingEnd: 12 },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#9CA3AF',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  checkboxOn: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  checkboxTick: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 },
  actionBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: '#fff', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  actionCount: { fontSize: 14, fontWeight: '700', color: '#111827' },
  actionButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cancelBtn: { paddingHorizontal: 14, paddingVertical: 9 },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  summaryBtn: {
    backgroundColor: '#5469D4', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 9,
  },
  summaryBtnDisabled: { backgroundColor: '#C7CDF2' },
  summaryText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  plate: { fontSize: 16, fontWeight: '700', color: '#111827', flexShrink: 1 },
  badgeGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  metaLabel: { fontSize: 12, color: '#9CA3AF' },
  metaValue: { fontSize: 12, fontWeight: '600', color: '#374151' },
});
