import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumericDate } from '@/utils/date';
const money = (n?: number | null, c?: string | null) =>
  n == null ? '—' : `${Number(n).toFixed(2)}${c ? ` ${c}` : ''}`;

interface PurchaseOrder {
  uuid: string;
  vendor_name?: string | null;
  status?: string | null;
  currency?: string | null;
  total_adjusted_amount?: number | null;
  net_amount_due?: number | null;
  is_overdue?: boolean | null;
  created_at: string;
}

/**
 * Stock coming in from suppliers.
 *
 * Shows the order total with what is still owed underneath, because those differ
 * once a payout has been made against it and only the second number tells you
 * whether the supplier still needs paying.
 */
export default function PurchaseOrdersScreen() {
  const router = useRouter();
  const { t, tef } = useLanguage();

  return (
    <View style={styles.root}>
      <ModuleListScreen<PurchaseOrder>
        module="purchase-orders"
        title={t('menu.purchaseOrders')}
        endpoint="/purchase-order/"
        itemsKey="purchase_orders"
        filters={[
          { id: 'pending', label: tef('pending'), params: { status: 'pending' } },
          { id: 'paid', label: tef('paid'), params: { status: 'paid' } },
          { id: 'overdue', label: t('purchaseOrders.overdue'), params: { is_overdue: 'true' } },
        ]}
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
              <ThemedText style={styles.value}>{money(x.total_adjusted_amount, x.currency)}</ThemedText>
            </View>
            <View style={styles.cardBottom}>
              <ThemedText style={styles.subtitle} numberOfLines={1}>
                {t('purchaseOrders.due', { amount: money(x.net_amount_due, x.currency) })}
              </ThemedText>
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
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  subtitle: { flex: 1, fontSize: 13, opacity: 0.55 },
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
});
