import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
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

export default function FinancialAccountsDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t } = useLanguage();
  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <ModuleDetailScreen<FinancialAccount>
      module="financial-accounts"
      title={t('menu.financialAccounts')}
      endpoint={`/financial-account/${uuid}`}
      reloadKey={reloadKey}
      heading={(x) => x.account_name}
      rows={(x): DetailRow[] => [
        [t('financialAccounts.balance'), money(x.balance, x.currency)],
        [t('financialAccounts.currency'), x.currency || '—'],
        [
          t('financialAccounts.kind'),
          x.is_external ? t('financialAccounts.external') : t('financialAccounts.internal'),
        ],
        [t('financialAccounts.notes'), x.notes || '—'],
      ]}
      actions={[
        {
          label: t('detail.edit'),
          testID: 'financial-account-edit',
          onPress: (x) => {
            setReloadKey((k) => k + 1);
            router.push({
              pathname: '/financial-accounts/create',
              params: {
                uuid: x.uuid,
                account_name: x.account_name ?? '',
                currency: x.currency ?? '',
                // the form's chips are keyed on the strings 'true'/'false'
                is_external: x.is_external ? 'true' : 'false',
                notes: x.notes ?? '',
              },
            });
          },
        },
      ]}
    />
  );
}
