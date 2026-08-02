import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Create or edit a warehouse. One screen for both — the fields are identical and
 * only the verb and endpoint differ. A `uuid` param means edit.
 */
export default function WarehouseFormScreen() {
  const { uuid, ...initial } = useLocalSearchParams<Record<string, string>>();
  const { t } = useLanguage();
  const editing = !!uuid;

  const fields: FormField[] = [
    { name: 'name', label: t('warehouses.name'), required: !editing },
    { name: 'address', label: t('warehouses.address'), required: !editing },
    { name: 'notes', label: t('warehouses.notes'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="warehouses"
      title={t(editing ? 'form.editTitle' : 'form.createTitle', { what: t('warehouses.one') })}
      fields={fields}
      initial={editing ? initial : undefined}
      method={editing ? 'PUT' : 'POST'}
      endpoint={editing ? `/warehouse/${uuid}` : '/warehouse/'}
    />
  );
}
