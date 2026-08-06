import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useHasEndpoint } from '@/hooks/useModuleAccess';
import { money } from '@/utils/money';
import { plainDate } from '@/utils/date';

interface PurchaseOrder {
  uuid: string;
  vendor_name?: string | null;
  status?: string | null;
  currency?: string | null;
  total_adjusted_amount?: number | null;
  net_amount_due?: number | null;
  is_overdue?: boolean | null;
  is_paid?: boolean | null;
  is_fulfilled?: boolean | null;
  payout_due_date?: string | null;
  created_at: string;
}

/**
 * Stock coming in from suppliers.
 *
 * Shows the order total with what is still owed underneath, because those differ
 * once a payout has been made against it and only the second number tells you
 * whether the supplier still needs paying.
 *
 * NO SEARCH BOX, deliberately. `search` is not in the list DTO (extra="forbid", so it
 * 422s the whole request), and the one field that looks like a vendor search —
 * `vendor_uuid` — is an ilike against the uuid COLUMN, not the name. A box that
 * silently matches nothing a human would type is worse than no box, so filtering is
 * chips only.
 *
 * `is_overdue` IS a working filter even though it currently returns nothing on
 * production: 26 of 63 orders have a null `is_overdue` because the model dereferences
 * `payout_due_date.tzinfo` before its own None check and pydantic swallows the
 * AttributeError into the Optional default. Empty is the data's fault, not the chip's.
 */
export default function PurchaseOrdersScreen() {
  const router = useRouter();
  const { t, tef } = useLanguage();
  const canCreate = useHasEndpoint('purchase_order', 'create');

  return (
    <View style={styles.root}>
      <ModuleListScreen<PurchaseOrder>
        module="purchase-orders"
        title={t('menu.purchaseOrders')}
        endpoint="/purchase-order/"
        itemsKey="purchase_orders"
        filters={[
          { id: 'pending', label: tef('pending'), params: { status: 'pending' } },
          { id: 'unpaid', label: t('purchaseOrders.unpaid'), params: { is_paid: 'false' } },
          {
            id: 'awaiting',
            label: t('purchaseOrders.awaitingFilter'),
            params: { is_fulfilled: 'false' },
          },
          { id: 'paid', label: tef('paid'), params: { is_paid: 'true' } },
          { id: 'overdue', label: t('purchaseOrders.overdue'), params: { is_overdue: 'true' } },
        ]}
        onCreate={canCreate ? () => router.push('/purchase-orders/create') : undefined}
        onAnalytics={() => router.push('/purchase-orders/analytics')}
        keyExtractor={(x) => x.uuid}
        renderItem={(x) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/purchase-orders/${x.uuid}`)}
            testID={`purchase-orders-${x.uuid}`}
          >
            <View style={styles.cardTop}>
              <ThemedText style={styles.title} numberOfLines={1}>
                {x.vendor_name || t('purchaseOrders.noVendor')}
              </ThemedText>
              <ThemedText style={styles.value}>
                {money(x.total_adjusted_amount, x.currency)}
              </ThemedText>
            </View>
            <View style={styles.cardBottom}>
              <ThemedText style={styles.subtitle} numberOfLines={1}>
                {t('purchaseOrders.due', { amount: money(x.net_amount_due, x.currency) })}
              </ThemedText>
              {/* string-split, never parsed: a naive-UTC midnight read through Date
                  shows the previous day for any viewer west of Greenwich */}
              {!!x.payout_due_date && (
                <ThemedText style={[styles.badge, x.is_overdue === true && styles.badgeLate]}>
                  {t('purchaseOrders.dueOn', {
                    date: plainDate(String(x.payout_due_date).slice(0, 10)),
                  })}
                </ThemedText>
              )}
              {x.is_fulfilled === false && (
                <ThemedText style={styles.badge}>{t('purchaseOrders.awaiting')}</ThemedText>
              )}
              {!!x.status && <ThemedText style={styles.badge}>{tef(x.status)}</ThemedText>}
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
    marginBottom: 8,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1f2937' },
  value: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  subtitle: { flex: 1, fontSize: 13, opacity: 0.55, minWidth: 90 },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4b5563',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  badgeLate: { color: '#b91c1c', backgroundColor: '#fee2e2' },
});
