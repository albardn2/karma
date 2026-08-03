import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

export const PER_PAGE = 20;

interface ModuleListScreenProps<T> {
  /** menu-module id — gates the route, same rule the menu grid uses */
  module?: string;
  /**
   * A scope the caller must hold instead of (or as well as) a module — for screens with
   * no MODULES entry to gate on, such as the platform-owner console.
   */
  requireScope?: string;
  /**
   * Admin or platform owner — see ModuleGuard's requireAdmin for why neither a module
   * nor a scope can express that set.
   */
  requireAdmin?: boolean;
  title: string;
  /** API path without query string, e.g. "/customer-order/" */
  endpoint: string;
  /** key under which the page payload carries the rows, e.g. "orders" */
  itemsKey: string;
  /** stable identity for each row */
  keyExtractor: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  /**
   * Query param the search box maps to; omit to hide search entirely.
   *
   * Only pass one the endpoint actually accepts. The list DTOs use
   * `extra="forbid"`, so an unrecognised param does not get ignored — it 422s the
   * whole request. Verified the hard way: `customer_name` looked obvious and is
   * not a filter customer-order supports.
   */
  searchParam?: string;
  searchPlaceholder?: string;
  /** extra fixed query params */
  params?: Record<string, string>;
  /**
   * Envelope field holding the page count. Almost every module calls it `pages`, but
   * the platform-owner endpoints call it `total_pages` — and reading the wrong one is
   * silent: it defaults to 1, so the list looks complete while hiding every page after
   * the first.
   */
  pagesKey?: string;
  /**
   * Mutually-exclusive filter chips. The scaffold owns the selection and folds the
   * chosen chip's params into the query, because every module wants this and none
   * of them should reimplement "reset to page 1 when the filter changes".
   */
  filters?: Array<{ id: string; label: string; params: Record<string, string> }>;
  /** rendered above the list, for anything a module needs beyond chips */
  header?: React.ReactNode;
  /** shows a + in the header; omit for modules the app cannot create */
  onCreate?: () => void;
  /** shows a chart button; omit for modules with no analytics endpoint */
  onAnalytics?: () => void;
}

/**
 * The shared shape of a module list: fetch, paginate, search, refresh, and the
 * three states everyone forgets — loading, empty, and failed.
 *
 * The app's first list screen (customers) grew to ~1,500 lines with all of this
 * inline. Repeating that 25 times means 25 copies of pagination and 25 places a
 * fix has to land, so the mechanics live here and a module supplies only what is
 * genuinely its own: its endpoint, its row, its filters.
 *
 * Wrapped in ModuleGuard rather than leaving that to each screen, so a module
 * cannot be added without its permission gate — the gate is not something a
 * future module has to remember.
 */
export function ModuleListScreen<T>({
  module,
  requireScope,
  requireAdmin,
  title,
  endpoint,
  itemsKey,
  keyExtractor,
  renderItem,
  searchParam,
  searchPlaceholder,
  params,
  pagesKey = 'pages',
  filters,
  header,
  onCreate,
  onAnalytics,
}: ModuleListScreenProps<T>) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [items, setItems] = useState<T[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Distinct from "no rows". A failed fetch that renders as an empty list tells
  // the user their data is gone, which is a worse lie than saying nothing.
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const filterParams = filters?.find((f) => f.id === activeFilter)?.params ?? {};

  const load = useCallback(
    async (targetPage: number, isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      try {
        const query = new URLSearchParams({
          page: String(targetPage),
          per_page: String(PER_PAGE),
          ...(params ?? {}),
          ...filterParams,
        });
        if (searchParam && appliedSearch.trim()) {
          query.append(searchParam, appliedSearch.trim());
        }
        const res = await apiCall<any>(`${endpoint}?${query.toString()}`);
        if (isOk(res.status) && res.data) {
          setItems(res.data[itemsKey] ?? []);
          setTotalPages(res.data[pagesKey] ?? 1);
          setTotalCount(res.data.total_count ?? 0);
        } else {
          // 403 included on purpose: the server is the authority, and a role
          // narrowed after this screen opened should read as refused, not empty.
          setFailed(true);
          setItems([]);
        }
      } catch {
        setFailed(true);
        setItems([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    // filterParams is derived from activeFilter, so depend on the id rather than
    // the object — a fresh object literal each render would re-fetch endlessly
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [endpoint, itemsKey, searchParam, appliedSearch, params, activeFilter],
  );

  useEffect(() => {
    load(page);
  }, [page, appliedSearch, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(page, true);
  }, [load, page]);

  const submitSearch = () => {
    setPage(1);
    setAppliedSearch(search);
  };

  return (
    <ModuleGuard module={module} requireScope={requireScope} requireAdmin={requireAdmin}>
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ title, headerShown: false }} />

        <View style={styles.headerRow}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          <View style={styles.headerRight}>
            {!loading && !failed && (
              <ThemedText style={styles.count} testID="module-list-count">
                {t('moduleList.count', { count: totalCount })}
              </ThemedText>
            )}
            {!!onAnalytics && (
              <TouchableOpacity
                style={styles.headerBtn}
                onPress={onAnalytics}
                testID="module-list-analytics"
              >
                <ThemedText style={styles.headerBtnText}>📊</ThemedText>
              </TouchableOpacity>
            )}
            {!!onCreate && (
              <TouchableOpacity style={styles.add} onPress={onCreate} testID="module-list-add">
                <ThemedText style={styles.addText}>+</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {searchParam && (
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={submitSearch}
            returnKeyType="search"
            placeholder={searchPlaceholder ?? t('moduleList.search')}
            placeholderTextColor="#9ca3af"
            testID="module-list-search"
          />
        )}

        {filters && filters.length > 0 && (
          <View style={styles.chips}>
            {[{ id: '__all', label: t('moduleList.all'), params: {} }, ...filters].map((f) => {
              const on = (f.id === '__all' && activeFilter === null) || f.id === activeFilter;
              return (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => {
                    setPage(1);
                    setActiveFilter(f.id === '__all' ? null : f.id);
                  }}
                  testID={`module-filter-${f.id}`}
                >
                  <ThemedText style={[styles.chipText, on && styles.chipTextOn]}>
                    {f.label}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {header}

        {loading ? (
          <View style={styles.centre}>
            <ActivityIndicator size="large" color="#5469D4" />
          </View>
        ) : failed ? (
          <View style={styles.centre}>
            <ThemedText style={styles.stateIcon}>⚠️</ThemedText>
            <ThemedText style={styles.stateText} testID="module-list-error">
              {t('moduleList.failed')}
            </ThemedText>
            <TouchableOpacity style={styles.retry} onPress={() => load(page)}>
              <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={keyExtractor}
            renderItem={({ item }) => <>{renderItem(item)}</>}
            contentContainerStyle={[
              styles.list,
              items.length === 0 && styles.listEmpty,
              { paddingBottom: 90 + insets.bottom },
            ]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListEmptyComponent={
              <View style={styles.centre}>
                <ThemedText style={styles.stateIcon}>📭</ThemedText>
                <ThemedText style={styles.stateText} testID="module-list-empty">
                  {appliedSearch ? t('moduleList.noMatches') : t('moduleList.empty')}
                </ThemedText>
              </View>
            }
            ListFooterComponent={
              totalPages > 1 ? (
                <View style={styles.pager}>
                  <TouchableOpacity
                    style={[styles.pageBtn, page <= 1 && styles.pageBtnOff]}
                    disabled={page <= 1}
                    onPress={() => setPage((p) => Math.max(1, p - 1))}
                    testID="module-list-prev"
                  >
                    <ThemedText style={styles.pageBtnText}>‹</ThemedText>
                  </TouchableOpacity>
                  <ThemedText style={styles.pageLabel}>
                    {t('moduleList.page', { page, pages: totalPages })}
                  </ThemedText>
                  <TouchableOpacity
                    style={[styles.pageBtn, page >= totalPages && styles.pageBtnOff]}
                    disabled={page >= totalPages}
                    onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                    testID="module-list-next"
                  >
                    <ThemedText style={styles.pageBtnText}>›</ThemedText>
                  </TouchableOpacity>
                </View>
              ) : null
            }
          />
        )}
      </ThemedView>
    </ModuleGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  title: { fontSize: 24, fontWeight: '700' },
  count: { fontSize: 13, opacity: 0.6 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  add: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#5469D4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addText: { color: '#fff', fontSize: 22, lineHeight: 26, fontWeight: '700' },
  headerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  headerBtnText: { fontSize: 15, lineHeight: 20 },
  search: {
    marginHorizontal: 20,
    marginVertical: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 10,
    fontSize: 15,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  chipOn: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextOn: { color: '#fff' },
  list: { paddingHorizontal: 20, paddingTop: 6 },
  listEmpty: { flexGrow: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateIcon: { fontSize: 34 },
  stateText: { fontSize: 15, opacity: 0.6, textAlign: 'center' },
  retry: {
    marginTop: 6,
    backgroundColor: '#5469D4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    paddingVertical: 18,
  },
  pageBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageBtnOff: { opacity: 0.35 },
  pageBtnText: { fontSize: 20, fontWeight: '700', color: '#5469D4' },
  pageLabel: { fontSize: 14, opacity: 0.7 },
});
