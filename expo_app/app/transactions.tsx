import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';

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

/**
 * Above this many accounts the chips stop helping.
 *
 * Each account needs two — "out of" and "into" — so the row count grows at 2N and a
 * tenant with ten accounts would push the list itself off the screen. Past the cap the
 * filters are dropped rather than rendered unusable: the list is still newest-first and
 * paginated, which is the thing people actually came for.
 */
const MAX_FILTERABLE_ACCOUNTS = 4;

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
 * The account filter chips set ONE side each, never both. The two params are ANDed
 * server-side, so setting both would ask for "moved from A *and* into A", which is not
 * what anyone means by filtering on an account. "Either side" would need two requests
 * merged client-side; until someone asks for it, the honest offering is one side at a
 * time with the chip saying which.
 */
export default function TransactionsScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<Record<string, Account>>({});
  const [filters, setFilters] = useState<
    Array<{ id: string; label: string; params: Record<string, string> }>
  >([]);

  const loadAccounts = useCallback(async () => {
    const res = await apiCall<{ accounts: Account[] }>(`/financial-account/?per_page=${PER_PAGE}`);
    if (!isOk(res.status)) return;
    const rows = res.data?.accounts ?? [];
    const map: Record<string, Account> = {};
    for (const a of rows) map[a.uuid] = a;
    setAccounts(map);
    if (rows.length > MAX_FILTERABLE_ACCOUNTS) {
      setFilters([]);
      return;
    }
    setFilters(
      rows.flatMap((a): Array<{ id: string; label: string; params: Record<string, string> }> => [
        {
          id: `out-${a.uuid}`,
          label: t('transactions.outOf', { account: a.account_name ?? '—' }),
          params: { from_account_uuid: a.uuid },
        },
        {
          id: `in-${a.uuid}`,
          label: t('transactions.into', { account: a.account_name ?? '—' }),
          params: { to_account_uuid: a.uuid },
        },
      ]),
    );
  }, [t]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const nameOf = (u?: string | null) => (u && accounts[u]?.account_name) || null;

  return (
    <ModuleListScreen<Transaction>
      module="transactions"
      title={t('menu.transactions')}
      endpoint="/transaction/"
      itemsKey="transactions"
      filters={filters}
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
              {x.created_at ? formatNumericDate(new Date(x.created_at)) : ''}
            </ThemedText>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowLeft: { flex: 1 },
  amount: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  route: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  notes: { fontSize: 11, opacity: 0.5, marginTop: 2 },
  when: { fontSize: 11, opacity: 0.5 },
});
