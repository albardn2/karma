import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall } from '@/utils/api';

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
  onPress: (item: T) => void;
  /** destructive actions get a confirm and red styling */
  destructive?: boolean;
  testID?: string;
}

interface ModuleDetailScreenProps<T> {
  module: string;
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
  title,
  endpoint,
  heading,
  subheading,
  rows,
  sections,
  actions,
  footer,
  reloadKey,
}: ModuleDetailScreenProps<T>) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [item, setItem] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      try {
        const res = await apiCall<T>(endpoint);
        if (res.status === 200 && res.data) setItem(res.data);
        else setFailed(true);
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [endpoint],
  );

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  return (
    <ModuleGuard module={module}>
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} testID="detail-back" hitSlop={12}>
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {title}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        {loading ? (
          <View style={styles.centre}>
            <ActivityIndicator size="large" color="#5469D4" />
          </View>
        ) : failed || !item ? (
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
            <ThemedText style={styles.heading} testID="detail-heading">
              {heading(item)}
            </ThemedText>
            {subheading?.(item)}

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

            {!!actions?.length && (
              <View style={styles.actions}>
                {actions.map((a) => (
                  <TouchableOpacity
                    key={a.label}
                    style={[styles.action, a.destructive && styles.actionDestructive]}
                    testID={a.testID}
                    onPress={() => {
                      if (!a.destructive) return a.onPress(item);
                      // a destructive action always asks first: these screens are
                      // used one-handed in a van, and a mis-tap should not delete
                      Alert.alert(a.label, t('detail.confirmDestructive'), [
                        { text: t('common.cancel'), style: 'cancel' },
                        { text: a.label, style: 'destructive', onPress: () => a.onPress(item) },
                      ]);
                    }}
                  >
                    <ThemedText
                      style={[styles.actionText, a.destructive && styles.actionTextDestructive]}
                    >
                      {a.label}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            )}

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
  actions: { marginTop: 22, gap: 10 },
  action: {
    backgroundColor: '#5469D4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  actionDestructive: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' },
  actionText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  actionTextDestructive: { color: '#dc2626' },
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
});
