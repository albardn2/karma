import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Create or edit an employee. One screen for both — a `uuid` param means edit.
 *
 * An employee is a person the business employs; a user is a login. Separate
 * resources with separate permissions, so creating one here does not create the
 * other.
 */
export default function EmployeeFormScreen() {
  const { uuid, ...initial } = useLocalSearchParams<Record<string, string>>();
  const { t, tef } = useLanguage();
  const editing = !!uuid;

  const fields: FormField[] = [
    { name: 'full_name', label: t('employees.name'), required: !editing },
    { name: 'phone_number', label: t('employees.phone'), required: !editing, keyboardType: 'phone-pad' },
    { name: 'email_address', label: t('employees.email'), keyboardType: 'email-address' },
    {
      name: 'role',
      label: t('employees.role'),
      kind: 'select',
      options: ['driver', 'sales', 'accountant', 'manager', 'employee', 'admin'].map((v) => ({ value: v, label: tef(v) })),
    },
    { name: 'full_address', label: t('employees.address') },
    { name: 'identification', label: t('employees.identification') },
    { name: 'notes', label: t('warehouses.notes'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="employees"
      title={t(editing ? 'form.editTitle' : 'form.createTitle', { what: t('employees.one') })}
      fields={fields}
      initial={editing ? initial : undefined}
      method={editing ? 'PUT' : 'POST'}
      endpoint={editing ? `/employee/${uuid}` : '/employee/'}
    />
  );
}
