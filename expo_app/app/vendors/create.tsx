import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Create or edit a vendor.
 *
 * One screen for both: the fields are identical and the only differences are the
 * verb and the endpoint. A `uuid` param means edit.
 *
 * Only the fields VendorCreate declares are offered. It is extra="forbid", so an
 * extra key rejects the whole submission — and email_address is typed EmailStr, so
 * a half-typed address 422s rather than being stored, which is why it is optional
 * and left out of the required set.
 */
export default function VendorFormScreen() {
  const { uuid, ...initial } = useLocalSearchParams<Record<string, string>>();
  const { t, tef } = useLanguage();
  const editing = !!uuid;

  const fields: FormField[] = [
    { name: 'company_name', label: t('vendors.company'), required: !editing },
    { name: 'full_name', label: t('vendors.contact'), required: !editing },
    {
      name: 'phone_number',
      label: t('vendors.phone'),
      required: !editing,
      keyboardType: 'phone-pad',
    },
    { name: 'email_address', label: t('vendors.email'), keyboardType: 'email-address' },
    {
      name: 'category',
      label: t('vendors.category'),
      kind: 'select',
      options: ['raw_materials', 'equipment', 'services', 'other'].map((v) => ({
        value: v,
        label: tef(v),
      })),
    },
    { name: 'full_address', label: t('vendors.address') },
    { name: 'notes', label: t('warehouses.notes'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="vendors"
      title={t(editing ? 'form.editTitle' : 'form.createTitle', { what: t('vendors.one') })}
      fields={fields}
      initial={editing ? initial : undefined}
      method={editing ? 'PUT' : 'POST'}
      endpoint={editing ? `/vendor/${uuid}` : '/vendor/'}
    />
  );
}
