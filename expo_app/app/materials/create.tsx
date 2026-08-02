import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Create or edit a material.
 *
 * All five MaterialType values are offered, not just the two present in the data —
 * a form that can only express what already exists cannot be used to add anything
 * new. Units come from UnitOfMeasure; both are validated server-side as enums, so a
 * free-text field here would 422.
 */
export default function MaterialFormScreen() {
  const { uuid, ...initial } = useLocalSearchParams<Record<string, string>>();
  const { t, tef } = useLanguage();
  const editing = !!uuid;

  const fields: FormField[] = [
    { name: 'name', label: t('materials.name'), required: !editing },
    { name: 'sku', label: t('materials.sku'), required: !editing },
    {
      name: 'type',
      label: t('materials.type'),
      kind: 'select',
      required: !editing,
      options: ['product', 'raw_material', 'prepared', 'machinery_and_equipment', 'vehicle'].map(
        (v) => ({ value: v, label: tef(v) }),
      ),
    },
    {
      name: 'measure_unit',
      label: t('materials.unit'),
      kind: 'select',
      options: ['kg', 'liters', 'meters', 'pcs'].map((v) => ({ value: v, label: tef(v) })),
    },
    { name: 'description', label: t('materials.description'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="materials"
      title={t(editing ? 'form.editTitle' : 'form.createTitle', { what: t('materials.one') })}
      fields={fields}
      initial={editing ? initial : undefined}
      method={editing ? 'PUT' : 'POST'}
      endpoint={editing ? `/material/${uuid}` : '/material/'}
    />
  );
}
