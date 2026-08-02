import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useLanguage } from '@/contexts/LanguageContext';

const money = (n?: number | null, c?: string | null) =>
  n == null ? '—' : `${Number(n).toFixed(2)}${c ? ` ${c}` : ''}`;

interface FinancialAccount {
  uuid: string;
  account_name: string;
  balance?: number | null;
  currency?: string | null;
  is_external?: boolean | null;
  notes?: string | null;
}

/**
 * Where money sits. Each currency has exactly one internal account, which is the
 * default payments and payouts resolve against; external accounts are everything
 * else and there may be any number of them.
 *
 * No search or chips — every filter this endpoint accepts is a uuid.
 */
export default function FinancialAccountsScreen() {
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <View style={styles.root}>
      <ModuleListScreen<FinancialAccount>
        module="financial-accounts"
        title={t('menu.financialAccounts')}
        endpoint="/financial-account/"
        itemsKey="accounts"
        keyExtractor={(x) => x.uuid}
        renderItem={(x) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push(`/financial-accounts/${x.uuid}`)}
            testID={`financial-accounts-${x.uuid}`}
          >
            <View style={styles.cardTop}>
              <ThemedText style={styles.title} numberOfLines={1}>
                {x.account_name}
              </ThemedText>
              <ThemedText style={styles.value}>{money(x.balance, x.currency)}</ThemedText>
            </View>
            <View style={styles.cardBottom}>
              <ThemedText style={styles.subtitle} numberOfLines={1}>
                {x.currency || '—'}
              </ThemedText>
              {x.is_external ? <ThemedText style={styles.badge}>{t('financialAccounts.external')}</ThemedText> : null}
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
