import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Edit a transaction's note.
 *
 * Its own screen rather than a general edit form because notes are the only field
 * TransactionUpdate accepts — an amount 422s. That is the right constraint for a ledger:
 * a wrong figure is corrected by another movement, not by rewriting the record. Offering
 * amount inputs here would invite exactly the correction the API refuses.
 *
 * ModuleForm sends only what changed, so leaving the note untouched and tapping save is
 * a no-op that returns rather than a pointless PUT.
 */
export default function TransactionNoteScreen() {
  const { uuid, notes } = useLocalSearchParams<{ uuid: string; notes?: string }>();
  const { t } = useLanguage();

  const fields: FormField[] = [
    { name: 'notes', label: t('transactions.notes'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="transactions"
      title={t('transactions.editNote')}
      fields={fields}
      initial={{ notes: notes ?? '' }}
      method="PUT"
      endpoint={`/transaction/${uuid}`}
    />
  );
}
