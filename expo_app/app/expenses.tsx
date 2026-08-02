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

interface Expense {
  uuid: string;
  description?: string | null;
  amount?: number | null;
  currency?: string | null;
  category?: string | null;
  status?: string | null;
  created_at: string;
}

/**
 * Money going out — fuel, rent, supplies.
 *
 * Chips filter on status rather than category: the category enum has nine values,
 * which does not fit a phone, and status is the question actually asked of an
 * expense (is it paid).
 */
export default function ExpensesScreen() {
  const router = useRouter();
  const { t, tef } = useLanguage();

  return (
    <View style={styles.root}>
      <ModuleListScreen<Expense>
        module="expenses"
        title={t('menu.expenses')}
        endpoint="/expense/"
        itemsKey="expenses"
        onAnalytics={() => router.push('/expenses/analytics')}
        filters={[
          { id: 'pending', label: tef('pending'), params: { status: 'pending' } },
          { id: 'paid', label: tef('paid'), params: { status: 'paid' } },
          { id: 'void', label: tef('void'), params: { status: 'void' } },
        ]}
        keyExtractor={(x) => x.uuid}
        renderItem={(x) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/expenses/${x.uuid}`)}
            testID={`expenses-${x.uuid}`}
          >
            <View style={styles.cardTop}>
              <ThemedText style={styles.title} numberOfLines={1}>
                {x.description || (x.category ? tef(x.category) : t('expenses.untitled'))}
              </ThemedText>
              <ThemedText style={styles.value}>{money(x.amount, x.currency)}</ThemedText>
            </View>
            <View style={styles.cardBottom}>
              <ThemedText style={styles.subtitle} numberOfLines={1}>
                {formatNumericDate(new Date(x.created_at))}
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
