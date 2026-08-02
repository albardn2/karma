import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
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

export default function ExpensesDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t, tef } = useLanguage();

  return (
    <ModuleDetailScreen<Expense>
      module="expenses"
      title={t('menu.expenses')}
      endpoint={`/expense/${uuid}`}
      heading={(x) => x.description || (x.category ? tef(x.category) : t('expenses.untitled'))}
      rows={(x): DetailRow[] => [
        [t('expenses.amount'), money(x.amount, x.currency)],
        [t('expenses.category'), x.category ? tef(x.category) : '—'],
        [t('expenses.status'), x.status ? tef(x.status) : '—'],
        [t('expenses.when'), formatNumericDate(new Date(x.created_at))],
      ]}
    />
  );
}
