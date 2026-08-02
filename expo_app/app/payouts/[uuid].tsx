import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
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

export default function PayoutsDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t } = useLanguage();

  return (
    <ModuleDetailScreen<Payout>
      module="payouts"
      title={t('menu.payouts')}
      endpoint={`/payout/${uuid}`}
      heading={(x) => money(x.amount, x.currency)}
      rows={(x): DetailRow[] => [
        [t('payouts.amount'), money(x.amount, x.currency)],
        [t('payouts.appliedTo'), x.expense_uuid ? t('payouts.forExpense') : x.purchase_order_uuid ? t('payouts.forPurchaseOrder') : t('payouts.unlinked')],
        [t('payouts.when'), formatNumericDate(new Date(x.created_at))],
        [t('payouts.notes'), x.notes || '—'],
      ]}
    />
  );
}
