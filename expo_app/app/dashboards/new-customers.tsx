import React, { useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { FilterChip, ScrollingChipRow } from '@/components/FilterChips';
import { BarChart } from '@/components/Chart';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useApiQuery } from '@/hooks/useApiQuery';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { BACK_GLYPH } from '@/utils/rtl';

interface Group {
  period_label: string;
  period_start: string;
  count: number;
}
interface Payload {
  granularity: string;
  groups: Group[];
}

type Gran = 'day' | 'week' | 'month' | 'quarter' | 'year';

// the same green the customer-orders dashboard uses for its "new customers"
// segment — one colour for one concept across the whole dashboard set
const NEW = '#16a34a';

/**
 * Newly created customers per period, as a plain bar chart.
 *
 * Counts of customer records created (soft-deletes excluded) — who joined the
 * book, not what they bought; the customer-orders dashboard answers the
 * purchasing side. One series, so this uses the plain BarChart rather than a
 * stack, and there is no currency involved.
 */
export function NewCustomersScreenImpl({ mine = false, embedded = false }: { mine?: boolean; embedded?: boolean }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useLanguage();

  const [gran, setGran] = useState<Gran>('month');

  // the personal variant hits the self-scoped endpoint: customers the caller
  // created only
  const endpoint = mine ? '/dashboard/my-new-customers' : '/dashboard/new-customers';
  const dash = useApiQuery<Payload>(
    `${endpoint}?granularity=${gran}`,
  );
  const { refreshing, onRefresh } = usePullToRefresh(dash.refetch);
  const data = dash.data ?? null;
  const loading = dash.isPending;
  const failed = dash.isError;

  const chartWidth = width - 72;
  const groups = data?.groups ?? [];
  const hasAny = groups.some((g) => g.count !== 0);

  const GRANS: Array<[Gran, string]> = [
    ['day', t('dashboards.gDay')],
    ['week', t('dashboards.gWeek')],
    ['month', t('dashboards.gMonth')],
    ['quarter', t('dashboards.gQuarter')],
    ['year', t('dashboards.gYear')],
  ];

  const inner = (
    <>
          <View style={styles.controls}>
            <ScrollingChipRow inset={20}>
              {GRANS.map(([g, label]) => (
                <FilterChip key={g} label={label} active={gran === g} onPress={() => setGran(g)} testID={`nc-gran-${g}`} />
              ))}
            </ScrollingChipRow>
          </View>

          {loading ? (
            <View style={styles.centre}>
              <ActivityIndicator size="large" color="#5469D4" />
            </View>
          ) : failed ? (
            <View style={styles.centre}>
              <ThemedText style={styles.stateText}>{t('moduleList.failed')}</ThemedText>
              <TouchableOpacity style={styles.retry} onPress={() => dash.refetch()}>
                <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
              </TouchableOpacity>
            </View>
          ) : !hasAny ? (
            <View style={styles.centre}>
              <ThemedText style={styles.stateText}>{t('dashboards.noData')}</ThemedText>
            </View>
          ) : (
            <>
              <View style={styles.panel}>
                <BarChart
                  width={chartWidth}
                  colour={NEW}
                  data={groups.map((g) => ({ label: g.period_label, value: g.count }))}
                />
              </View>

              {/* the numbers behind the bars, newest first */}
              <View style={styles.table}>
                {[...groups].reverse().map((g) => (
                  <View key={g.period_start} style={styles.row}>
                    <ThemedText style={styles.rowLabel}>{g.period_label}</ThemedText>
                    <ThemedText style={[styles.rowVal, g.count > 0 && { color: NEW, fontWeight: '700' }]}>
                      {g.count}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </>
          )}
    </>
  );

  // Home stacks this panel inside its own scroller: section title in place
  // of the top bar, and no ScrollView / guard of its own
  if (embedded) {
    return (
      <View style={styles.embeddedSection}>
        <ThemedText style={styles.embeddedTitle}>{t(mine ? 'dashboards.myNewCustomers' : 'dashboards.newCustomers')}</ThemedText>
        {inner}
      </View>
    );
  }

  return (
    <ModuleGuard module="dashboard">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="nc-back">
            <ThemedText style={styles.back}>{BACK_GLYPH}</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle}>
            {t(mine ? 'dashboards.myNewCustomers' : 'dashboards.newCustomers')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: 40 + insets.bottom }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }
        >
          {inner}
        </ScrollView>
      </ThemedView>
    </ModuleGuard>
  );
}

export default function NewCustomersScreen() {
  return <NewCustomersScreenImpl />;
}

const styles = StyleSheet.create({
  embeddedSection: { paddingHorizontal: 20 },
  embeddedTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 12, textAlign: 'left' },
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 20, paddingTop: 6 },
  controls: { gap: 10, marginBottom: 14 },
  panel: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  table: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 12, fontWeight: '700', color: '#111827' },
  rowVal: { fontSize: 12, color: '#6B7280', fontVariant: ['tabular-nums'] },
  centre: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  retry: { backgroundColor: '#5469D4', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryText: { color: '#fff', fontWeight: '600' },
});
