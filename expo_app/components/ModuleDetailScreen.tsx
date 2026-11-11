import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

export type DetailRow = [label: string, value: string];

export interface DetailSection<T> {
  title: string;
  /** rows to render; an empty array shows the empty note instead */
  render: (item: T) => React.ReactNode;
  /** shown when the section has nothing */
  emptyText?: string;
  isEmpty?: (item: T) => boolean;
}

export interface DetailAction<T> {
  label: string;
  /**
   * Return the request's promise to have the scaffold hold every action button
   * until it settles — a second tap on Delete while the first is in flight
   * otherwise sends the request twice.
   */
  onPress: (item: T) => void | Promise<unknown>;
  /** destructive actions get a confirm and red styling */
  destructive?: boolean;
  testID?: string;
  /**
   * Hide the action for records it does not apply to — e.g. no "record a payout" on
   * an expense that is already settled, which the server would refuse anyway. The
   * item is only known after the fetch, so this cannot be decided by the caller when
   * it builds the array.
   */
  visible?: (item: T) => boolean;
  /**
   * Replace the confirm body for a destructive action.
   *
   * The default says the change cannot be undone, which is true of a delete and false
   * of a reversible one like deactivating a user. Marking such an action
   * non-destructive instead would drop the confirm altogether and lose the red
   * styling, so the wording is what varies, not the mechanism.
   *
   * Takes a function when the warning depends on the record — how many lines a delete
   * takes with it, say. The caller builds this array before the fetch, so a count from
   * the record itself is not available to a plain string.
   */
  confirmText?: string | ((item: T) => string);
}

interface ModuleDetailScreenProps<T> {
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
  /** shown in the top bar */
  title: string;
  /** full path to the single record, e.g. "/vendor/abc-123" */
  endpoint: string;
  /** big heading for the record */
  heading: (item: T) => string;
  /** optional line under the heading — an amount, a status */
  subheading?: (item: T) => React.ReactNode;
  rows: (item: T) => DetailRow[];
  /** related records — line items, stock, invoices */
  sections?: DetailSection<T>[];
  /** edit / delete / record-a-payment, rendered as buttons under the record */
  actions?: DetailAction<T>[];
  /** free-text block rendered last, e.g. notes */
  footer?: (item: T) => React.ReactNode;
  /** bumped by a caller to force a refetch after a write */
  reloadKey?: number;
  /**
   * Refetch, quietly, each time the screen comes back into view — for a record
   * another screen writes to (record a payment, then back). Not on the first
   * focus: the mount already fetches, and bumping reloadKey from the caller's
   * own focus effect fetched everything twice on open.
   */
  reloadOnFocus?: boolean;
}

/**
 * The shared shape of a single record: fetch, refresh, loading/failed states, the
 * permission gate, and a label/value table.
 *
 * Same reasoning as ModuleListScreen — with two dozen modules to add, the parts
 * that are identical everywhere belong in one place, and a module supplies only
 * its heading and its rows. Rows are computed by the caller so a module can
 * resolve extra context (a name behind a uuid) before handing them over.
 */
export function ModuleDetailScreen<T>({
  module,
  requireScope,
  requireAdmin,
  title,
  endpoint,
  heading,
  subheading,
  rows,
  sections,
  actions,
  footer,
  reloadKey,
  reloadOnFocus,
}: ModuleDetailScreenProps<T>) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [item, setItem] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  // the action whose request is in flight; every action waits for it
  const [busyAction, setBusyAction] = useState<string | null>(null);
  // Only the newest request may land: a reload after a save can be overtaken
  // by an older one still in flight, which would put the pre-save record back.
  const requestSeq = useRef(0);

  const load = useCallback(
    async (isRefresh = false) => {
      const seq = ++requestSeq.current;
      if (!isRefresh) setLoading(true);
      setFailed(false);
      try {
        const res = await apiCall<T>(endpoint);
        if (seq !== requestSeq.current) return;
        if (isOk(res.status) && res.data) setItem(res.data);
        else setFailed(true);
      } catch {
        if (seq === requestSeq.current) setFailed(true);
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [endpoint],
  );

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const focusedOnce = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!reloadOnFocus) return;
      if (!focusedOnce.current) {
        focusedOnce.current = true;
        return;
      }
      load(true);
    }, [reloadOnFocus, load]),
  );

  const runAction = async (a: DetailAction<T>, record: T) => {
    if (busyAction) return;
    const pending = a.onPress(record);
    if (!pending) return;
    setBusyAction(a.label);
    try {
      await pending;
    } finally {
      setBusyAction(null);
    }
  };

  // The full-screen spinner is for the first load only. A reload after a save
  // swapped the whole record for it, which read as the screen breaking and
  // dropped the scroll position; the record stays while the new copy loads.
  const blocking = loading && !item;

  // an action with no `visible` predicate always shows; one with a predicate is asked
  const shownActions = item
    ? (actions ?? []).filter((a) => (a.visible ? a.visible(item) : true))
    : [];

  return (
    <ModuleGuard module={module} requireScope={requireScope} requireAdmin={requireAdmin}>
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} testID="detail-back" hitSlop={12}>
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {title}
          </ThemedText>
          {loading && !blocking ? (
            <ActivityIndicator size="small" color="#5469D4" style={styles.backSpacer} />
          ) : (
            <View style={styles.backSpacer} />
          )}
        </View>

        {blocking ? (
          <View style={styles.centre}>
            <ActivityIndicator size="large" color="#5469D4" />
          </View>
        ) : !item ? (
          <View style={styles.centre}>
            <ThemedText style={styles.stateIcon}>⚠️</ThemedText>
            <ThemedText style={styles.stateText} testID="detail-error">
              {t('moduleList.failed')}
            </ThemedText>
            <TouchableOpacity style={styles.retry} onPress={() => load()}>
              <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
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
            {failed && (
              // a reload that failed with the record already on screen: keep
              // it, but say it may be out of date rather than pass it off as
              // current
              <ThemedText style={styles.staleNote} testID="detail-stale">
                {t('moduleDetail.refreshFailed')}
              </ThemedText>
            )}
            <ThemedText style={styles.heading} testID="detail-heading">
              {heading(item)}
            </ThemedText>
            {subheading?.(item)}

            {!!shownActions.length && (
              <View style={styles.actions}>
                {shownActions.map((a) => (
                  <TouchableOpacity
                    key={a.label}
                    style={[
                      styles.action,
                      a.destructive && styles.actionDestructive,
                      !!busyAction && styles.actionBusy,
                    ]}
                    disabled={!!busyAction}
                    testID={a.testID}
                    onPress={() => {
                      if (!a.destructive) return runAction(a, item);
                      // a destructive action always asks first: these screens are
                      // used one-handed in a van, and a mis-tap should not delete
                      const body =
                        typeof a.confirmText === 'function'
                          ? a.confirmText(item)
                          : a.confirmText;
                      Alert.alert(a.label, body ?? t('detail.confirmDestructive'), [
                        { text: t('common.cancel'), style: 'cancel' },
                        { text: a.label, style: 'destructive', onPress: () => runAction(a, item) },
                      ]);
                    }}
                  >
                    {busyAction === a.label ? (
                      <ActivityIndicator color={a.destructive ? '#dc2626' : '#fff'} />
                    ) : (
                      <ThemedText
                        style={[styles.actionText, a.destructive && styles.actionTextDestructive]}
                      >
                        {a.label}
                      </ThemedText>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.card}>
              {rows(item).map(([label, value]) => (
                <View key={label} style={styles.row}>
                  <ThemedText style={styles.rowLabel}>{label}</ThemedText>
                  <ThemedText style={styles.rowValue} numberOfLines={3}>
                    {value}
                  </ThemedText>
                </View>
              ))}
            </View>

            {sections?.map((sec) => (
              <View key={sec.title}>
                <ThemedText style={styles.sectionTitle}>{sec.title}</ThemedText>
                <View style={styles.card}>
                  {sec.isEmpty?.(item) ? (
                    <ThemedText style={styles.rowLabel}>
                      {sec.emptyText ?? t('moduleList.empty')}
                    </ThemedText>
                  ) : (
                    sec.render(item)
                  )}
                </View>
              </View>
            ))}


            {footer?.(item)}
          </ScrollView>
        )}
      </ThemedView>
    </ModuleGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 20, paddingTop: 6 },
  // explicit lineHeight: RN clips a large glyph's ascender without it
  heading: { fontSize: 22, lineHeight: 29, fontWeight: '700', color: '#1f2937' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 16, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { flex: 1, fontSize: 14, opacity: 0.65 },
  rowValue: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1f2937', textAlign: 'right' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 22, marginBottom: -6 },
  // above the record, not below it: what you came to DO should be in reach
  // without scrolling past everything there is to read
  actions: { marginTop: 18, gap: 10 },
  action: {
    backgroundColor: '#5469D4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionDestructive: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  actionTextDestructive: { color: '#dc2626' },
  actionBusy: { opacity: 0.6 },
  staleNote: {
    fontSize: 13,
    lineHeight: 18,
    color: '#92400e',
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 10,
    overflow: 'hidden',
  },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateIcon: { fontSize: 34, lineHeight: 42 },
  stateText: { fontSize: 15, opacity: 0.6, textAlign: 'center' },
  retry: {
    marginTop: 6,
    backgroundColor: '#5469D4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
