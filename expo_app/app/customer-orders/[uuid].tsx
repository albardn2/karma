import React, { useCallback, useEffect, useState } from 'react';
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
import { ModuleGuard } from '@/components/ModuleGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';

interface OrderItem {
  uuid: string;
  material_name?: string | null;
  quantity: number;
  unit?: string | null;
  is_fulfilled: boolean;
}

interface OrderDetail {
  uuid: string;
  created_at: string;
  is_fulfilled: boolean;
  is_overdue: boolean;
  is_paid?: boolean | null;
  currency?: string | null;
  total_adjusted_amount: number;
  net_amount_due?: number | null;
  net_amount_paid?: number | null;
  customer_company_name?: string | null;
  customer_full_name?: string | null;
  customer_order_items?: OrderItem[] | null;
}

/**
 * One order, with its lines.
 *
 * Reads the with-items-and-invoice endpoint rather than the plain one: the list
 * already showed everything the plain record holds, so opening a row has to add
 * the lines or the tap was not worth making.
 */
export default function CustomerOrderDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      try {
        const res = await apiCall<any>(`/customer-order/with-items-and-invoice/${uuid}`);
        if (res.status === 200 && res.data?.customer_order) {
          setOrder(res.data.customer_order);
        } else {
          setFailed(true);
        }
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [uuid],
  );

  useEffect(() => {
    load();
  }, [load]);

  const money = (amount?: number | null) =>
    amount == null
      ? '—'
      : `${Number(amount).toFixed(2)}${order?.currency ? ` ${order.currency}` : ''}`;

  return (
    <ModuleGuard module="customer-orders">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} testID="order-back" hitSlop={12}>
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('menu.customerOrders')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        {loading ? (
          <View style={styles.centre}>
            <ActivityIndicator size="large" color="#5469D4" />
          </View>
        ) : failed || !order ? (
          <View style={styles.centre}>
            <ThemedText style={styles.stateIcon}>⚠️</ThemedText>
            <ThemedText style={styles.stateText} testID="order-detail-error">
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
            <ThemedText style={styles.customer} testID="order-customer">
              {order.customer_company_name ||
                order.customer_full_name ||
                t('customerOrders.noCustomer')}
            </ThemedText>
            <ThemedText style={styles.date}>
              {formatNumericDate(new Date(order.created_at))}
            </ThemedText>

            <View style={styles.badges}>
              <ThemedText
                style={[styles.badge, order.is_fulfilled ? styles.badgeOk : styles.badgePending]}
              >
                {order.is_fulfilled
                  ? t('customerOrders.fulfilled')
                  : t('customerOrders.unfulfilled')}
              </ThemedText>
              <ThemedText style={[styles.badge, order.is_paid ? styles.badgeOk : styles.badgeDue]}>
                {order.is_paid ? t('customerOrders.paid') : t('customerOrders.unpaid')}
              </ThemedText>
              {order.is_overdue && (
                <ThemedText style={[styles.badge, styles.badgeOverdue]}>
                  {t('customerOrders.overdue')}
                </ThemedText>
              )}
            </View>

            <View style={styles.card}>
              {[
                [t('customerOrders.total'), money(order.total_adjusted_amount)],
                [t('customerOrders.paidAmount'), money(order.net_amount_paid)],
                [t('customerOrders.due'), money(order.net_amount_due)],
              ].map(([label, value]) => (
                <View key={label} style={styles.row}>
                  <ThemedText style={styles.rowLabel}>{label}</ThemedText>
                  <ThemedText style={styles.rowValue}>{value}</ThemedText>
                </View>
              ))}
            </View>

            <ThemedText style={styles.sectionTitle}>
              {t('customerOrders.items', { count: order.customer_order_items?.length ?? 0 })}
            </ThemedText>

            <View style={styles.card}>
              {(order.customer_order_items ?? []).length === 0 ? (
                <ThemedText style={styles.rowLabel}>{t('customerOrders.noItems')}</ThemedText>
              ) : (
                (order.customer_order_items ?? []).map((it) => (
                  <View key={it.uuid} style={styles.row}>
                    <ThemedText style={styles.rowLabel} numberOfLines={1}>
                      {it.material_name || '—'}
                    </ThemedText>
                    <ThemedText style={styles.rowValue}>
                      {it.quantity}
                      {it.unit ? ` ${it.unit}` : ''}
                    </ThemedText>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}
      </ThemedView>
    </ModuleGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 20, paddingTop: 6 },
  customer: { fontSize: 22, fontWeight: '700', color: '#1f2937' },
  date: { fontSize: 13, opacity: 0.55, marginTop: 2 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  badgeOk: { backgroundColor: '#dcfce7', color: '#166534' },
  badgePending: { backgroundColor: '#f3f4f6', color: '#4b5563' },
  badgeDue: { backgroundColor: '#fef3c7', color: '#92400e' },
  badgeOverdue: { backgroundColor: '#fee2e2', color: '#991b1b' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 22, marginBottom: 8 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    gap: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { flex: 1, fontSize: 14, opacity: 0.65 },
  rowValue: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
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
