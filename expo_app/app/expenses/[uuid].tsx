import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ModuleDetailScreen, DetailRow, DetailAction } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useHasModule } from '@/hooks/useModuleAccess';
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
  /** derived from non-deleted payouts, not stored — so a write means a refetch */
  amount_paid?: number | null;
  amount_due?: number | null;
  is_paid?: boolean | null;
  created_at: string;
}

/**
 * An expense, and paying it.
 *
 * amount_paid, amount_due, is_paid and status are hybrid properties summed over the
 * expense's payouts rather than columns, so recording a payout cannot be reflected by
 * patching local state — the screen refetches and lets the server recompute.
 */
export default function ExpensesDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t, tef } = useLanguage();
  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);
  // recording a payout is a payouts-module write even though it starts here; a user
  // without that module would have the request refused, so it is not offered
  const canPayout = useHasModule('payouts');

  const actions: DetailAction<Expense>[] = [
    {
      label: t('detail.edit'),
      testID: 'expense-edit',
      onPress: (x) => {
        setReloadKey((k) => k + 1);
        // amount and currency are deliberately not passed: ExpenseUpdate forbids them,
        // so the edit form does not offer them either
        router.push({
          pathname: '/expenses/create',
          params: {
            uuid: x.uuid,
            category: x.category ?? '',
            description: x.description ?? '',
          },
        });
      },
    },
  ];

  if (canPayout) {
    actions.push({
      label: t('expenses.recordPayout'),
      testID: 'expense-payout',
      // nothing left to pay means the server would refuse it — matching the web app,
      // which shows its button only when !expense.is_paid
      visible: (x) => !x.is_paid && Number(x.amount_due ?? 0) > 0,
      onPress: (x) => {
        setReloadKey((k) => k + 1);
        router.push({
          pathname: '/payouts/create',
          params: {
            expense_uuid: x.uuid,
            currency: x.currency ?? '',
            amount_due: x.amount_due != null ? String(x.amount_due) : '',
          },
        });
      },
    });
  }

  return (
    <ModuleDetailScreen<Expense>
      module="expenses"
      title={t('menu.expenses')}
      endpoint={`/expense/${uuid}`}
      reloadKey={reloadKey}
      heading={(x) => x.description || (x.category ? tef(x.category) : t('expenses.untitled'))}
      rows={(x): DetailRow[] => [
        [t('expenses.amount'), money(x.amount, x.currency)],
        [t('expenses.paidOut'), money(x.amount_paid, x.currency)],
        [t('expenses.stillOwed'), money(x.amount_due, x.currency)],
        [t('expenses.category'), x.category ? tef(x.category) : '—'],
        [t('expenses.status'), x.status ? tef(x.status) : '—'],
        [t('expenses.when'), formatNumericDate(new Date(x.created_at))],
      ]}
      actions={actions}
    />
  );
}
