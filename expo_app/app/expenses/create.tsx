import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Create or edit an expense. One screen for both — a `uuid` param means edit.
 *
 * AMOUNT AND CURRENCY ARE CREATE-ONLY. ExpenseUpdate accepts only category,
 * description, vendor_uuid and trip_uuid — it deliberately has no amount, because an
 * expense can already have payouts recorded against it and silently restating the
 * figure would break that reconciliation. Offering the input and letting the request
 * 422 would be worse than not offering it: the user would have typed a correction the
 * system was never going to accept. Correcting an amount means a new expense.
 *
 * Category has nine values, which is a lot of chips but the right control — it is the
 * field the analytics screen groups by.
 */
export default function ExpenseFormScreen() {
  const { uuid, ...initial } = useLocalSearchParams<Record<string, string>>();
  const { t, tef } = useLanguage();
  const editing = !!uuid;

  const fields: FormField[] = [
    ...(editing
      ? []
      : ([
          { name: 'amount', label: t('expenses.amount'), required: true, kind: 'number' },
          {
            name: 'currency',
            label: t('financialAccounts.currency'),
            required: true,
            kind: 'select',
            options: ['USD', 'SYP'].map((v) => ({ value: v, label: tef(v) })),
          },
        ] as FormField[])),
    {
      name: 'category',
      label: t('expenses.category'),
      required: !editing,
      kind: 'select',
      options: [
        'electricity',
        'water',
        'rent',
        'maintenance',
        'equipment',
        'supplies',
        'travel',
        'meals',
        'other',
      ].map((v) => ({ value: v, label: tef(v) })),
    },
    { name: 'description', label: t('expenses.descriptionField'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="expenses"
      title={t(editing ? 'form.editTitle' : 'form.createTitle', { what: t('expenses.one') })}
      fields={fields}
      initial={editing ? initial : undefined}
      method={editing ? 'PUT' : 'POST'}
      endpoint={editing ? `/expense/${uuid}` : '/expense/'}
    />
  );
}
