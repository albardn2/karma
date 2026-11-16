import React from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ModuleDetailScreen, DetailAction, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useHasEndpoint } from '@/hooks/useModuleAccess';
import { apiCall, apiErrorText, isOk } from '@/utils/api';
import { formatNumericDate, parseTs } from '@/utils/date';
import { money } from '@/utils/money';
import { PayoutLinks, payoutKindKey } from '@/utils/payout';

interface Payout extends PayoutLinks {
  uuid: string;
  amount?: number | null;
  currency?: string | null;
  notes?: string | null;
  created_at: string;
  paid_for?: string | null;
  financial_account_name?: string | null;
}

/**
 * One payout. Only its notes can be edited: the amount, currency and link define
 * what was paid, and a wrong one is corrected by deleting it and recording it again.
 *
 * Deleting is admin-only on the server. What a payout settled is computed from the
 * live payouts, so deleting one puts its expense or purchase order back to owing that
 * amount, and the paying account gets the money back.
 */
export default function PayoutsDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const canEdit = useHasEndpoint('payout', 'update');

  const remove = async (x: Payout) => {
    const res = await apiCall(`/payout/${x.uuid}`, { method: 'DELETE' });
    if (isOk(res.status)) {
      router.back();
      return;
    }
    Alert.alert(t('payouts.deleteFailed'), apiErrorText(res.error, t('form.tryAgain')));
  };

  const actions: DetailAction<Payout>[] = [
    {
      label: t('payouts.editNotes'),
      testID: 'payout-edit',
      visible: () => canEdit,
      onPress: (x) => router.push({ pathname: '/payouts/edit', params: { uuid: x.uuid, notes: x.notes ?? '' } }),
    },
    {
      label: t('detail.delete'),
      destructive: true,
      testID: 'payout-delete',
      visible: () => isAdmin,
      confirmText: (x) =>
        t('payouts.deleteConfirm', { amount: money(x.amount, x.currency), what: x.paid_for || t(payoutKindKey(x)) }),
      onPress: remove,
    },
  ];

  return (
    <ModuleDetailScreen<Payout>
      module="payouts"
      title={t('menu.payouts')}
      endpoint={`/payout/${uuid}`}
      heading={(x) => money(x.amount, x.currency)}
      actions={actions}
      rows={(x): DetailRow[] => [
        [t('payouts.amount'), money(x.amount, x.currency)],
        [t('payouts.appliedTo'), t(payoutKindKey(x))],
        [t('payouts.paidFor'), x.paid_for || '—', 'text'],
        [t('payouts.paidFrom'), x.financial_account_name || '—'],
        [t('payouts.when'), formatNumericDate(parseTs(x.created_at))],
        [t('payouts.notes'), x.notes || '—', 'text'],
      ]}
    />
  );
}
