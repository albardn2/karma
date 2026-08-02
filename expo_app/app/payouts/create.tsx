import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Record a payout against something — today, an expense.
 *
 * A payout is never a free-standing record: POST /payout/ requires exactly one of
 * purchase_order_uuid, expense_uuid, employee_uuid or credit_note_item_uuid, and
 * refuses both none and more than one. So this screen is always reached FROM the
 * thing being paid, which arrives as a param and is passed through `extra` rather
 * than offered as an input.
 *
 * Three fields the user is deliberately not asked for, each verified against the
 * live API:
 *
 * CURRENCY comes from the expense. It must equal the expense's currency — mismatch
 * is 400 "Currency mismatch between payout and expense" — so an input here could
 * only ever be used to pick a rejected value.
 *
 * THE FINANCIAL ACCOUNT is not in the create DTO at all. The server resolves the
 * tenant's single non-external account for that currency and 404s when there is
 * none, which is exactly why those two accounts are created with the tenant.
 *
 * THE AMOUNT is prefilled with what is still owed but stays editable, because
 * partial payouts are supported: paying 20 of 50 leaves the expense pending with
 * amount_due 30. Overpaying is refused with 400 "cannot create payout for expense
 * with negative amount due", and that message is shown to the user as-is.
 */
export default function PayoutCreateScreen() {
  const { expense_uuid, currency, amount_due } = useLocalSearchParams<{
    expense_uuid: string;
    currency: string;
    amount_due?: string;
  }>();
  const { t } = useLanguage();

  const fields: FormField[] = [
    {
      name: 'amount',
      label: currency ? `${t('payouts.amount')} (${currency})` : t('payouts.amount'),
      required: true,
      kind: 'number',
    },
    { name: 'notes', label: t('payouts.notes'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="payouts"
      title={t('payouts.record')}
      fields={fields}
      initial={{ amount: amount_due ?? '' }}
      extra={{ expense_uuid, currency }}
      method="POST"
      endpoint="/payout/"
    />
  );
}
