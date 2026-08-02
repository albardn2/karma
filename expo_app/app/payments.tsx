import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumericDate } from '@/utils/date';

interface Payment {
  uuid: string;
  amount: number;
  currency?: string | null;
  payment_method?: string | null;
  created_at: string;
  invoice_uuid?: string | null;
  debit_note_item_uuid?: string | null;
  notes?: string | null;
}

/**
 * Money collected.
 *
 * The list deliberately does NOT show who paid. PaymentRead carries no customer
 * field — the payer is two hops away, through the invoice — so putting a name on
 * every row would mean two extra requests per row. The detail screen spends those
 * for one record instead, which is where the question actually gets asked.
 *
 * What a row can honestly answer is how much, in what currency, when, and what it
 * was applied to, so that is what it shows.
 */
export default function PaymentsScreen() {
  const router = useRouter();
  const { t, tef } = useLanguage();

  return (
    <View style={styles.root}>
      <ModuleListScreen<Payment>
        module="payments"
        title={t('menu.payments')}
        endpoint="/payment/"
        itemsKey="payments"
        // No chips: every filter this endpoint accepts is a uuid (invoice,
        // financial account, debit note), none of which a person can pick from a
        // phone. Offering a status filter it does not have would 422 the request.
        keyExtractor={(p) => p.uuid}
        renderItem={(p) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/payments/${p.uuid}`)}
            testID={`payment-${p.uuid}`}
          >
            <View style={styles.cardTop}>
              <ThemedText style={styles.amount}>
                {Number(p.amount ?? 0).toFixed(2)}
                {p.currency ? ` ${p.currency}` : ''}
              </ThemedText>
              {!!p.payment_method && (
                <ThemedText style={styles.method}>{tef(p.payment_method)}</ThemedText>
              )}
            </View>
            <View style={styles.cardBottom}>
              <ThemedText style={styles.date}>
                {formatNumericDate(new Date(p.created_at))}
              </ThemedText>
              <ThemedText style={styles.against}>
                {p.invoice_uuid
                  ? t('payments.againstInvoice')
                  : p.debit_note_item_uuid
                    ? t('payments.againstDebitNote')
                    : t('payments.unlinked')}
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
  amount: { flex: 1, fontSize: 18, fontWeight: '700', color: '#166534' },
  method: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4b5563',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  date: { fontSize: 13, opacity: 0.55 },
  against: { fontSize: 12, opacity: 0.5 },
});
