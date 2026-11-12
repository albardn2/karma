import React, { useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { PickerField } from '@/components/PickerField';
import { FilterChip } from '@/components/FilterChips';
import { useApiQuery } from '@/hooks/useApiQuery';
import { formatNumericDate, parseTs } from '@/utils/date';

interface Transaction {
  uuid: string;
  from_amount?: number | null;
  from_currency?: string | null;
  from_account_uuid?: string | null;
  to_amount?: number | null;
  to_currency?: string | null;
  to_account_uuid?: string | null;
  usd_to_syp_exchange_rate?: number | null;
  notes?: string | null;
  created_at: string;
}

interface Account {
  uuid: string;
  account_name?: string | null;
  currency?: string | null;
}

const PER_PAGE = 100;

type Direction = 'out' | 'in';

const money = (n?: number | null, c?: string | null) =>
  n == null ? null : `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}${c ? ` ${c}` : ''}`;

/**
 * Money moving between financial accounts.
 *
 * A transaction has an optional FROM side and an optional TO side, and at least one of
 * them: money out of an account, money into an account, or a transfer with both. So a
 * row's shape is not fixed and the card has to read which sides are present rather than
 * assume a pair.
 *
 * NO TEXT SEARCH. TransactionListParams permits from_account_uuid, to_account_uuid,
 * start_date, end_date, uuid, page and per_page — nothing else — so `searchParam` is
 * omitted rather than pointed at something that would 422 the request.
 *
 * The account filter is a picker plus an "out of / into" choice, so it works for any
 * number of accounts. It sets ONE side, never both: the two params are ANDed
 * server-side, so setting both would ask for "moved from A *and* into A", which is not
 * what anyone means by filtering on an account. "Either side" would need two requests
 * merged client-side.
 */
export default function TransactionsScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const accountsQuery = useApiQuery<{ accounts: Account[] }>(
    `/financial-account/?per_page=${PER_PAGE}`,
  );
  const accounts = useMemo(() => {
    const map: Record<string, Account> = {};
    for (const a of accountsQuery.data?.accounts ?? []) map[a.uuid] = a;
    return map;
  }, [accountsQuery.data]);
  const [account, setAccount] = useState<{ uuid: string; label: string }>({ uuid: '', label: '' });
  const [direction, setDirection] = useState<Direction>('out');

  // stable per selection: ModuleListScreen dep-tracks `params` by identity
  const params = useMemo((): Record<string, string> | undefined => {
    if (!account.uuid) return undefined;
    return direction === 'out'
      ? { from_account_uuid: account.uuid }
      : { to_account_uuid: account.uuid };
  }, [account.uuid, direction]);

  const nameOf = (u?: string | null) => (u && accounts[u]?.account_name) || null;

  return (
    <View style={styles.screen}>
      <ModuleListScreen<Transaction>
        module="transactions"
        title={t('menu.transactions')}
        endpoint="/transaction/"
        itemsKey="transactions"
        params={params}
        header={
          <View style={styles.accountFilter}>
            <ThemedText style={styles.filterLabel}>{t('transactions.filterAccount')}</ThemedText>
            <PickerField
              spec={{
                endpoint: '/financial-account/',
                itemsKey: 'accounts',
                params: { per_page: String(PER_PAGE) },
                label: (a) => a.account_name || a.uuid,
                sublabel: (a) => a.currency || undefined,
                value: (a) => a.uuid,
              }}
              value={account.uuid}
              onChange={(uuid, label) => setAccount({ uuid, label })}
              initialLabel={account.label || undefined}
              testID="transactions-account-filter"
            />
            {!!account.uuid && (
              <View style={styles.directionRow}>
                <FilterChip
                  label={t('transactions.outOf', { account: account.label })}
                  active={direction === 'out'}
                  onPress={() => setDirection('out')}
                  testID="transactions-direction-out"
                />
                <FilterChip
                  label={t('transactions.into', { account: account.label })}
                  active={direction === 'in'}
                  onPress={() => setDirection('in')}
                  testID="transactions-direction-in"
                />
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={() => setAccount({ uuid: '', label: '' })}
                  testID="transactions-account-clear"
                >
                  <ThemedText style={styles.clearText}>{t('transactions.allAccounts')}</ThemedText>
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
        keyExtractor={(x) => x.uuid}
        renderItem={(x) => {
          const out = money(x.from_amount, x.from_currency);
          const into = money(x.to_amount, x.to_currency);
          const from = nameOf(x.from_account_uuid);
          const to = nameOf(x.to_account_uuid);
          // a transfer shows both sides; a one-sided movement shows only the side it has
          const amount = out && into ? `${out} → ${into}` : (out ?? into ?? '—');
          const route = from && to ? `${from} → ${to}` : (from ?? to ?? '—');
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push(`/transactions/${x.uuid}`)}
              testID={`transaction-${x.uuid}`}
            >
              <View style={styles.rowLeft}>
                <ThemedText style={styles.amount} numberOfLines={1}>
                  {amount}
                </ThemedText>
                <ThemedText style={styles.route} numberOfLines={1}>
                  {route}
                </ThemedText>
                {!!x.notes && (
                  <ThemedText style={styles.notes} numberOfLines={1}>
                    {x.notes}
                  </ThemedText>
                )}
              </View>
              <ThemedText style={styles.when}>
                {x.created_at ? formatNumericDate(parseTs(x.created_at)) : ''}
              </ThemedText>
            </TouchableOpacity>
          );
        }}
      />
      <BottomNavigation activeTab="menu" onTabPress={() => router.replace('/(tabs)?tab=menu')} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowLeft: { flex: 1 },
  amount: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  route: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  notes: { fontSize: 11, opacity: 0.5, marginTop: 2 },
  when: { fontSize: 11, opacity: 0.5 },
  accountFilter: { marginBottom: 8 },
  filterLabel: { fontSize: 12, fontWeight: '600', opacity: 0.6, marginBottom: 6 },
  directionRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 8 },
  clearBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  clearText: { fontSize: 13, fontWeight: '600', color: '#5469D4' },
});
