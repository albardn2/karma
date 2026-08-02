import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Create or edit a financial account. One screen for both — a `uuid` param means edit.
 *
 * is_external is the consequential field. `uq_financial_account_internal_currency`
 * is UNIQUE on (account_uuid, currency) WHERE NOT is_external AND NOT is_deleted, so
 * each tenant has at most one internal account per currency — the one payments and
 * payouts resolve against by default. A second internal SYP account is refused by the
 * database, which surfaces here as the server's own error text rather than a
 * client-side rule, so it stays true if the constraint changes.
 *
 * It defaults to external for that reason: the two internal accounts are created with
 * the tenant, and a user adding an account by hand is almost always adding someone
 * else's — a bank, a customer's wallet.
 */
export default function FinancialAccountFormScreen() {
  const { uuid, ...initial } = useLocalSearchParams<Record<string, string>>();
  const { t, tef } = useLanguage();
  const editing = !!uuid;

  const fields: FormField[] = [
    { name: 'account_name', label: t('financialAccounts.name'), required: !editing },
    {
      name: 'currency',
      label: t('financialAccounts.currency'),
      required: !editing,
      kind: 'select',
      options: ['USD', 'SYP'].map((v) => ({ value: v, label: tef(v) })),
    },
    {
      name: 'is_external',
      label: t('financialAccounts.kind'),
      kind: 'boolean',
      options: [
        { value: 'true', label: t('financialAccounts.external') },
        { value: 'false', label: t('financialAccounts.internal') },
      ],
    },
    { name: 'notes', label: t('financialAccounts.notes'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="financial-accounts"
      title={t(editing ? 'form.editTitle' : 'form.createTitle', {
        what: t('financialAccounts.one'),
      })}
      fields={fields}
      initial={editing ? { is_external: 'true', ...initial } : { is_external: 'true' }}
      method={editing ? 'PUT' : 'POST'}
      endpoint={editing ? `/financial-account/${uuid}` : '/financial-account/'}
    />
  );
}
