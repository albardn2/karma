import React, { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ModuleDetailScreen, DetailRow, DetailAction } from '@/components/ModuleDetailScreen';
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

const money = (n?: number | null, c?: string | null) =>
  n == null ? '—' : `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}${c ? ` ${c}` : ''}`;

/**
 * One money movement.
 *
 * The account uuids are resolved through /financial-account/ because the transaction
 * record carries uuids and no names. `created_by_uuid` is deliberately NOT resolved: the
 * only way to turn it into a username is /auth/users, which is admin-only, so an
 * accountant looking at this screen would get a 403 for a line of provenance nobody
 * asked for.
 *
 * NOTES ARE THE ONLY EDITABLE FIELD. TransactionUpdate takes notes and nothing else —
 * sending an amount 422s — which is right for a ledger: a wrong figure is corrected by
 * another movement, not by rewriting history. So the single action is an edit-note form
 * rather than a general edit.
 */
export default function TransactionDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t } = useLanguage();
  const router = useRouter();
  const [accounts, setAccounts] = useState<Record<string, Account>>({});
  const [reloadKey, setReloadKey] = useState(0);

  const loadAccounts = useCallback(async () => {
    const res = await apiCall<{ accounts: Account[] }>(`/financial-account/?per_page=${PER_PAGE}`);
    if (!isOk(res.status)) return;
    const map: Record<string, Account> = {};
    for (const a of res.data?.accounts ?? []) map[a.uuid] = a;
    setAccounts(map);
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const label = (u?: string | null) => {
    if (!u) return '—';
    const a = accounts[u];
    if (!a) return '—';
    return a.currency ? `${a.account_name ?? '—'} (${a.currency})` : (a.account_name ?? '—');
  };

  const actions: DetailAction<Transaction>[] = [
    {
      label: t('transactions.editNote'),
      testID: 'transaction-edit-note',
      onPress: (x) => {
        setReloadKey((k) => k + 1);
        router.push({
          pathname: '/transactions/note',
          params: { uuid: x.uuid, notes: x.notes ?? '' },
        });
      },
    },
  ];

  return (
    <ModuleDetailScreen<Transaction>
      module="transactions"
      title={t('menu.transactions')}
      endpoint={`/transaction/${uuid}`}
      reloadKey={reloadKey}
      heading={(x) => {
        const out = x.from_amount != null ? money(x.from_amount, x.from_currency) : null;
        const into = x.to_amount != null ? money(x.to_amount, x.to_currency) : null;
        return out && into ? `${out} → ${into}` : (out ?? into ?? '—');
      }}
      rows={(x): DetailRow[] => [
        [t('transactions.fromAccount'), label(x.from_account_uuid)],
        [t('transactions.fromAmount'), x.from_amount != null ? money(x.from_amount, x.from_currency) : '—'],
        [t('transactions.toAccount'), label(x.to_account_uuid)],
        [t('transactions.toAmount'), x.to_amount != null ? money(x.to_amount, x.to_currency) : '—'],
        [
          t('transactions.rate'),
          x.usd_to_syp_exchange_rate != null ? String(x.usd_to_syp_exchange_rate) : '—',
        ],
        [t('transactions.when'), x.created_at ? formatNumericDate(new Date(x.created_at)) : '—'],
        [t('transactions.notes'), x.notes || '—'],
      ]}
      actions={actions}
    />
  );
}
