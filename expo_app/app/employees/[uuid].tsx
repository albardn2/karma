import React, { useCallback, useState } from 'react';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';

interface Employee {
  uuid: string;
  full_name: string;
  role?: string | null;
  phone_number?: string | null;
  email_address?: string | null;
  full_address?: string | null;
  identification?: string | null;
  notes?: string | null;
}

export default function EmployeesDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t, tef } = useLanguage();
  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);

  // focus, not push: edit opens a screen that writes, and a stack pop does not remount
  // this one. A bump before the push refetched while that screen was opening, before
  // the write, so coming back showed the old record. One bump per focus event; setState
  // does not re-trigger focus, so this cannot loop.
  useFocusEffect(
    useCallback(() => {
      setReloadKey((k) => k + 1);
    }, []),
  );

  return (
    <ModuleDetailScreen<Employee>
      module="employees"
      title={t('menu.employees')}
      endpoint={`/employee/${uuid}`}
      reloadKey={reloadKey}
      heading={(x) => x.full_name}
      rows={(x): DetailRow[] => [
        [t('employees.role'), x.role ? tef(x.role) : '—'],
        [t('employees.phone'), x.phone_number || '—'],
        [t('employees.email'), x.email_address || '—'],
        [t('employees.address'), x.full_address || '—'],
        [t('employees.identification'), x.identification || '—'],
      ]}
      actions={[
        {
          label: t('detail.edit'),
          testID: 'employee-edit',
          onPress: (x) => {
            router.push({
              pathname: '/employees/create',
              params: {
                uuid: x.uuid,
                full_name: x.full_name ?? '',
                phone_number: x.phone_number ?? '',
                email_address: x.email_address ?? '',
                role: x.role ?? '',
                full_address: x.full_address ?? '',
                identification: x.identification ?? '',
                notes: x.notes ?? '',
              },
            });
          },
        },
      ]}
    />
  );
}
