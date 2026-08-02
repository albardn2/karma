import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';

interface Employee {
  uuid: string;
  full_name: string;
  role?: string | null;
  phone_number?: string | null;
  email_address?: string | null;
}

export default function EmployeesDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t, tef } = useLanguage();

  return (
    <ModuleDetailScreen<Employee>
      module="employees"
      title={t('menu.employees')}
      endpoint={`/employee/${uuid}`}
      heading={(x) => x.full_name}
      rows={(x): DetailRow[] => [
        [t('employees.role'), x.role ? tef(x.role) : '—'],
        [t('employees.phone'), x.phone_number || '—'],
        [t('employees.email'), x.email_address || '—'],
      ]}
    />
  );
}
