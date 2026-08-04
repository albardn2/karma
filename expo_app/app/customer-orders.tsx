import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { PickerField } from '@/components/PickerField';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumericDate } from '@/utils/date';
import { money } from '@/utils/money';

interface CustomerOrder {
  uuid: string;
  created_at: string;
  is_fulfilled: boolean;
  is_overdue: boolean;
  is_paid?: boolean | null;
  currency?: string | null;
  total_adjusted_amount: number;
  net_amount_due?: number | null;
  customer_company_name?: string | null;
  customer_full_name?: string | null;
}

/**
 * Customer orders.
 *
 * This tile has existed since the app shipped and did nothing but raise a
 * "coming soon" alert — the only entry in the menu that promised something it
 * did not have.
 *
 * Status is shown as three independent facts rather than one blended badge,
 * because they are independent: an order can be fulfilled and unpaid, paid and
 * unfulfilled, and overdue is about the invoice rather than the goods. Collapsing
 * them into a single "status" is what makes a rep think a delivered order has
 * been settled.
 *
 * The customer filter is a picker rather than a search box, deliberately. The
 * list DTO accepts exactly uuid/customer_uuid/is_paid/is_fulfilled/is_overdue —
 * there is no text-search param, and this codebase's list DTOs 422 the WHOLE
 * request on an unknown param rather than ignoring it. So free-text search over
 * orders cannot exist here; picking the customer (whose own endpoint DOES search
 * server-side, case-insensitive) covers the real need: "show me this shop's
 * orders". There is no date filter for the same reason — the web offers one and
 * it 422s the entire list on use, a bug this screen does not inherit.
 */
export default function CustomerOrdersScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  // arriving from a customer's detail screen pre-applies that customer
  const { customerUuid, customerName } = useLocalSearchParams<{
    customerUuid?: string;
    customerName?: string;
  }>();
  const [customer, setCustomer] = useState<{ uuid: string; label: string }>({
    uuid: customerUuid ?? '',
    label: customerName ?? '',
  });

  // a stable object per chosen customer: ModuleListScreen dep-tracks `params` by
  // identity, so an inline literal would re-fetch on every render
  const params = useMemo(
    () => (customer.uuid ? { customer_uuid: customer.uuid } : undefined),
    [customer.uuid],
  );

  return (
    <View style={styles.root}>
      <ModuleListScreen<CustomerOrder>
        module="customer-orders"
        title={t('menu.customerOrders')}
        endpoint="/customer-order/"
        itemsKey="orders"
        params={params}
        onCreate={() => router.push('/customer-orders/create')}
        header={
          <View style={styles.customerFilter}>
            {/* labelled, because unlabelled it reads as a stray form field rather than
                a filter — the picker's own placeholder is just "Choose…" */}
            <ThemedText style={styles.filterLabel}>
              {t('customerOrders.filterCustomer')}
            </ThemedText>
            <PickerField
              spec={{
                endpoint: '/customer/',
                itemsKey: 'customers',
                searchParam: 'company_name',
                label: (c) => c.company_name || c.full_name || c.uuid,
                sublabel: (c) => (c.company_name ? c.full_name || undefined : undefined),
                value: (c) => c.uuid,
              }}
              value={customer.uuid}
              onChange={(uuid, label) => setCustomer({ uuid, label })}
              testID="orders-customer-filter"
            />
            {!!customer.uuid && (
              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => setCustomer({ uuid: '', label: '' })}
                testID="orders-customer-clear"
              >
                <ThemedText style={styles.clearText}>
                  {t('customerOrders.allCustomers')}
                </ThemedText>
              </TouchableOpacity>
            )}
          </View>
        }
        filters={[
          // Exactly the filters the endpoint accepts. The list DTO forbids extra
          // params, so offering a field it does not support 422s every request
          // rather than being ignored.
          { id: 'unpaid', label: t('customerOrders.unpaid'), params: { is_paid: 'false' } },
          {
            id: 'unfulfilled',
            label: t('customerOrders.unfulfilled'),
            params: { is_fulfilled: 'false' },
          },
          { id: 'overdue', label: t('customerOrders.overdue'), params: { is_overdue: 'true' } },
          { id: 'paid', label: t('customerOrders.paid'), params: { is_paid: 'true' } },
        ]}
        keyExtractor={(o) => o.uuid}
        renderItem={(o) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/customer-orders/${o.uuid}`)}
            testID={`order-${o.uuid}`}
          >
            <View style={styles.cardTop}>
              <ThemedText style={styles.customer} numberOfLines={1}>
                {o.customer_company_name || o.customer_full_name || t('customerOrders.noCustomer')}
              </ThemedText>
              <ThemedText style={styles.amount}>
                {money(o.total_adjusted_amount, o.currency)}
              </ThemedText>
            </View>

            <View style={styles.cardBottom}>
              <ThemedText style={styles.date}>{formatNumericDate(new Date(o.created_at))}</ThemedText>
              <View style={styles.badges}>
                <ThemedText
                  style={[styles.badge, o.is_fulfilled ? styles.badgeOk : styles.badgePending]}
                >
                  {o.is_fulfilled
                    ? t('customerOrders.fulfilled')
                    : t('customerOrders.unfulfilled')}
                </ThemedText>
                <ThemedText style={[styles.badge, o.is_paid ? styles.badgeOk : styles.badgeDue]}>
                  {o.is_paid ? t('customerOrders.paid') : t('customerOrders.unpaid')}
                </ThemedText>
                {o.is_overdue && (
                  <ThemedText style={[styles.badge, styles.badgeOverdue]}>
                    {t('customerOrders.overdue')}
                  </ThemedText>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
      <BottomNavigation activeTab="menu" onTabPress={() => router.replace('/(tabs)?tab=menu')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  customerFilter: { marginBottom: 12 },
  filterLabel: { fontSize: 12, fontWeight: '600', opacity: 0.6, marginBottom: 6 },
  clearBtn: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 2 },
  clearText: { fontSize: 13, color: '#5469D4', fontWeight: '600' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  customer: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1f2937' },
  amount: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  date: { fontSize: 13, opacity: 0.55 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-end' },
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
});
