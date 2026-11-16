import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/** A payout's notes, the one field PayoutUpdate accepts. */
export default function PayoutEditScreen() {
  const { uuid, notes } = useLocalSearchParams<{ uuid: string; notes?: string }>();
  const { t } = useLanguage();

  const fields: FormField[] = [{ name: 'notes', label: t('payouts.notes'), kind: 'multiline' }];

  return (
    <ModuleForm
      module="payouts"
      title={t('payouts.editNotes')}
      fields={fields}
      initial={{ notes: notes ?? '' }}
      method="PUT"
      endpoint={`/payout/${uuid}`}
    />
  );
}
