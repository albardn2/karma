import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';

interface OrderItem {
  uuid: string;
  material_name?: string | null;
  quantity: number;
  unit?: string | null;
  is_fulfilled?: boolean | null;
}

interface Invoice {
  uuid: string;
  currency?: string | null;
  due_date?: string | null;
  is_paid?: boolean | null;
  is_overdue?: boolean | null;
  net_amount_due?: number | null;
  net_amount_paid?: number | null;
  total_adjusted_amount?: number | null;
}

interface Order {
  uuid: string;
  created_at: string;
  currency?: string | null;
  is_fulfilled: boolean;
  is_paid?: boolean | null;
  is_overdue: boolean;
  total_adjusted_amount: number;
  net_amount_paid?: number | null;
  net_amount_due?: number | null;
  customer_company_name?: string | null;
  customer_full_name?: string | null;
  notes?: string | null;
  customer_order_items?: OrderItem[] | null;
}

/** The with-items-and-invoice endpoint wraps the record. */
interface OrderPayload {
  customer_order: Order;
  invoices?: Invoice[] | null;
}

/**
 * One order: what was sold, what is owed, and the two things a rep does about it.
 *
 * The fulfil-and-take-payment flow is NOT rebuilt here. The app already has that
 * screen at app/distribution/order.tsx, and it reads tripStopUuid as optional and
 * sends `trip_stop_uuid: tripStopUuid || null` — so it works perfectly well entered
 * from the menu rather than from a trip. Routing to it keeps one implementation of
 * the money path instead of a second one that drifts.
 */
export default function CustomerOrderDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const { t } = useLanguage();
  const [reloadKey, setReloadKey] = useState(0);

  const money = (n?: number | null, c?: string | null) =>
    n == null ? '—' : `${Number(n).toFixed(2)}${c ? ` ${c}` : ''}`;

  const remove = async () => {
    // the with-items variant so line items and the invoice go too, rather than
    // leaving orphans behind the order
    const res = await apiCall(`/customer-order/with-items-and-invoice/${uuid}`, {
      method: 'DELETE',
    });
    if (isOk(res.status)) router.back();
    else
      Alert.alert(
        t('detail.delete'),
        String(res.error ?? '').slice(0, 300) || t('form.tryAgain'),
      );
  };

  return (
    <ModuleDetailScreen<OrderPayload>
      module="customer-orders"
      title={t('menu.customerOrders')}
      endpoint={`/customer-order/with-items-and-invoice/${uuid}`}
      reloadKey={reloadKey}
      heading={(d) =>
        d.customer_order.customer_company_name ||
        d.customer_order.customer_full_name ||
        t('customerOrders.noCustomer')
      }
      subheading={(d) => {
        const o = d.customer_order;
        return (
          <View style={styles.badges}>
            <ThemedText style={[styles.badge, o.is_fulfilled ? styles.ok : styles.pending]}>
              {o.is_fulfilled ? t('customerOrders.fulfilled') : t('customerOrders.unfulfilled')}
            </ThemedText>
            <ThemedText style={[styles.badge, o.is_paid ? styles.ok : styles.due]}>
              {o.is_paid ? t('customerOrders.paid') : t('customerOrders.unpaid')}
            </ThemedText>
            {o.is_overdue && (
              <ThemedText style={[styles.badge, styles.overdue]}>
                {t('customerOrders.overdue')}
              </ThemedText>
            )}
          </View>
        );
      }}
      rows={(d): DetailRow[] => {
        const o = d.customer_order;
        return [
          [t('customerOrders.total'), money(o.total_adjusted_amount, o.currency)],
          [t('customerOrders.paidAmount'), money(o.net_amount_paid, o.currency)],
          [t('customerOrders.due'), money(o.net_amount_due, o.currency)],
          [t('payments.received'), formatNumericDate(new Date(o.created_at))],
          [t('inventory.notes'), o.notes || '—'],
        ];
      }}
      sections={[
        {
          title: t('customerOrders.itemsTitle'),
          isEmpty: (d) => !(d.customer_order.customer_order_items ?? []).length,
          emptyText: t('customerOrders.noItems'),
          render: (d) => (
            <>
              {(d.customer_order.customer_order_items ?? []).map((it) => (
                <View key={it.uuid} style={styles.line}>
                  <ThemedText style={styles.lineName} numberOfLines={1}>
                    {it.material_name || '—'}
                  </ThemedText>
                  <ThemedText style={styles.lineQty}>
                    {it.quantity}
                    {it.unit ? ` ${it.unit}` : ''}
                  </ThemedText>
                  {/* per-line, because an order is routinely part-delivered */}
                  <ThemedText
                    style={[styles.badge, it.is_fulfilled ? styles.ok : styles.pending]}
                  >
                    {it.is_fulfilled
                      ? t('customerOrders.fulfilled')
                      : t('customerOrders.unfulfilled')}
                  </ThemedText>
                </View>
              ))}
            </>
          ),
        },
        {
          title: t('customerOrders.invoices'),
          isEmpty: (d) => !(d.invoices ?? []).length,
          emptyText: t('customerOrders.noInvoices'),
          render: (d) => (
            <>
              {(d.invoices ?? []).map((inv) => (
                <View key={inv.uuid} style={styles.invoice}>
                  <View style={styles.invoiceTop}>
                    <ThemedText style={styles.invoiceAmount}>
                      {money(inv.net_amount_due, inv.currency)} {t('customerOrders.due')}
                    </ThemedText>
                    {inv.is_overdue && (
                      <ThemedText style={[styles.badge, styles.overdue]}>
                        {t('customerOrders.overdue')}
                      </ThemedText>
                    )}
                  </View>
                  <ThemedText style={styles.invoiceMeta}>
                    {t('customerOrders.paidAmount')} {money(inv.net_amount_paid, inv.currency)}
                    {inv.due_date ? ` · ${formatNumericDate(new Date(inv.due_date))}` : ''}
                  </ThemedText>
                </View>
              ))}
            </>
          ),
        },
      ]}
      actions={[
        {
          label: t('customerOrders.fulfilAndPay'),
          testID: 'order-fulfil-pay',
          onPress: () => {
            setReloadKey((k) => k + 1);
            router.push({ pathname: '/distribution/order', params: { orderUuid: uuid } });
          },
        },
        {
          label: t('detail.delete'),
          destructive: true,
          testID: 'order-delete',
          onPress: remove,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  ok: { backgroundColor: '#dcfce7', color: '#166534' },
  pending: { backgroundColor: '#f3f4f6', color: '#4b5563' },
  due: { backgroundColor: '#fef3c7', color: '#92400e' },
  overdue: { backgroundColor: '#fee2e2', color: '#991b1b' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  lineName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1f2937' },
  lineQty: { fontSize: 14, opacity: 0.7 },
  invoice: { paddingVertical: 6 },
  invoiceTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  invoiceAmount: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1f2937' },
  invoiceMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
});
