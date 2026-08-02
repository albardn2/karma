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

interface Payout {
  uuid: string;
  amount?: number | null;
  currency?: string | null;
  notes?: string | null;
  created_at: string;
  expense_uuid?: string | null;
  purchase_order_uuid?: string | null;
}

/**
 * Money paid out, against an expense or a purchase order.
 *
 * The mirror of Payments, and like it there is nothing user-pickable to filter on —
 * every accepted param is a uuid — so the list is a plain chronological ledger.
 */
export default function PayoutsScreen() {
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <View style={styles.root}>
      <ModuleListScreen<Payout>
        module="payouts"
        title={t('menu.payouts')}
        endpoint="/payout/"
        itemsKey="payouts"
        keyExtractor={(x) => x.uuid}
        renderItem={(x) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/payouts/${x.uuid}`)}
            testID={`payouts-${x.uuid}`}
          >
            <View style={styles.cardTop}>
              <ThemedText style={styles.title} numberOfLines={1}>
                {money(x.amount, x.currency)}
              </ThemedText>
            </View>
            <View style={styles.cardBottom}>
              <ThemedText style={styles.subtitle} numberOfLines={1}>
                {formatNumericDate(new Date(x.created_at))}
              </ThemedText>
              <ThemedText style={styles.badge}>
                {x.expense_uuid
                  ? t('payouts.forExpense')
                  : x.purchase_order_uuid
                    ? t('payouts.forPurchaseOrder')
                    : t('payouts.unlinked')}
              </ThemedText>
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
