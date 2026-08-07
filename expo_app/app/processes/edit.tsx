import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Edit a production run — which means its notes, and nothing else.
 *
 * That is the endpoint's own shape rather than a simplification: ProcessUpdate declares
 * `notes` and is extra="forbid", so `data` is a 422. It could not be otherwise without
 * being dangerous — the materials and amounts have already moved stock, and letting them
 * be retyped would either re-run the movement or silently decouple the record from the
 * inventory events it caused.
 *
 * Correcting a run therefore means deleting it and recording it again, which the detail
 * screen's delete does cleanly while the produced lot is still untouched.
 */
export default function ProcessEditScreen() {
  const { uuid, notes } = useLocalSearchParams<{ uuid: string; notes?: string }>();
  const { t } = useLanguage();

  const fields: FormField[] = [
    { name: 'notes', label: t('processes.notesLabel'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="processes"
      title={t('processes.editTitle')}
      note={t('processes.editNote')}
      fields={fields}
      initial={{ notes: notes ?? '' }}
      method="PUT"
      endpoint={`/process/${uuid}`}
      errorMessages={{ 403: t('processes.forbiddenCreate') }}
    />
  );
}
