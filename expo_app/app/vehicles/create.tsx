import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Create or edit a vehicle. One screen for both — a `uuid` param means edit.
 *
 * VehicleCreate requires plate_number, make, model, year, color and status; only
 * vin and notes are optional. VehicleUpdate makes every field optional, so
 * `required` is conditioned on the mode rather than fixed per field — on an edit
 * the form sends only what changed, and demanding a color to correct a plate number
 * would be a constraint this screen invented rather than one the API has.
 */
export default function VehicleFormScreen() {
  const { uuid, ...initial } = useLocalSearchParams<Record<string, string>>();
  const { t, tef } = useLanguage();
  const editing = !!uuid;

  const fields: FormField[] = [
    { name: 'plate_number', label: t('vehicles.plate'), required: !editing },
    { name: 'make', label: t('vehicles.make'), required: !editing },
    { name: 'model', label: t('vehicles.model'), required: !editing },
    { name: 'year', label: t('vehicles.year'), required: !editing, kind: 'number' },
    { name: 'color', label: t('vehicles.color'), required: !editing },
    {
      name: 'status',
      label: t('vehicles.status'),
      required: !editing,
      kind: 'select',
      options: ['active', 'inactive', 'maintenance', 'sold', 'retired', 'utilized'].map((v) => ({
        value: v,
        label: tef(v),
      })),
    },
    { name: 'vin', label: t('vehicles.vin') },
    { name: 'notes', label: t('warehouses.notes'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="vehicles"
      title={t(editing ? 'form.editTitle' : 'form.createTitle', { what: t('vehicles.one') })}
      fields={fields}
      initial={editing ? initial : undefined}
      method={editing ? 'PUT' : 'POST'}
      endpoint={editing ? `/vehicle/${uuid}` : '/vehicle/'}
    />
  );
}
