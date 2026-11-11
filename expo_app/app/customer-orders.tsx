import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { CUSTOMER_PICKER, PickerField } from '@/components/PickerField';
import { OrderStatusBadges } from '@/components/OrderStatusBadges';
import { useLanguage } from '@/contexts/LanguageContext';
import { useHasEndpoint } from '@/hooks/useModuleAccess';
import { formatNumericDate, parseTs } from '@/utils/date';
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
  net_amount_paid?: number | null;
  customer_company_name?: string | null;
  customer_full_name?: string | null;
  customer_order_items?: { is_deleted?: boolean | null; is_fulfilled?: boolean | null }[] | null;
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
  // checkout is a customer_order create; an accountant reads orders but may not
  // raise one, and a + that answers 403 is a button that lies
  const canCreate = useHasEndpoint('customer_order', 'create');

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
        filtered={!!customer.uuid}
        onCreate={
          canCreate
            ? () =>
                // filtered to one customer: the new order is most likely theirs
                router.push({
                  pathname: '/customer-orders/create',
                  params: customer.uuid
                    ? { customerUuid: customer.uuid, customerName: customer.label }
                    : {},
                })
            : undefined
        }
        header={
          <View style={styles.customerFilter}>
            {/* labelled, because unlabelled it reads as a stray form field rather than
                a filter — the picker's own placeholder is just "Choose…" */}
            <ThemedText style={styles.filterLabel}>
              {t('customerOrders.filterCustomer')}
            </ThemedText>
            <PickerField
              spec={CUSTOMER_PICKER}
              value={customer.uuid}
              // the name it arrived with from a customer's screen — the field
              // otherwise read as a raw uuid until it was opened
              initialLabel={customer.label}
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
              {/* naive UTC from the server: read as local it moved an evening
                  order to the next day */}
              <ThemedText style={styles.date}>{formatNumericDate(parseTs(o.created_at))}</ThemedText>
              <OrderStatusBadges order={o} style={styles.badges} />
            </View>
          </TouchableOpacity>
        )}
      />
      <BottomNavigation activeTab="menu" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // the list's own gutter: the scaffold renders `header` full-bleed
  customerFilter: { marginHorizontal: 20, marginBottom: 12 },
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
  badges: { flexShrink: 1, justifyContent: 'flex-end' },
});
