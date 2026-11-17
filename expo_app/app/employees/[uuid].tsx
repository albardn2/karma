import React, { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiCall, apiErrorText, isOk } from '@/utils/api';

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
  const { isAdmin } = useAuth();

  // admin-only on the server, which refuses an employee with payouts and says so
  const remove = async () => {
    const res = await apiCall(`/employee/${uuid}`, { method: 'DELETE' });
    if (isOk(res.status)) {
      router.back();
      return;
    }
    Alert.alert(t('employees.deleteFailed'), apiErrorText(res.error, t('form.tryAgain')));
  };

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
        [t('employees.address'), x.full_address || '—', 'text'],
        [t('employees.identification'), x.identification || '—'],
        [t('warehouses.notes'), x.notes || '—', 'text'],
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
        {
          label: t('detail.delete'),
          destructive: true,
          testID: 'employee-delete',
          visible: () => isAdmin,
          confirmText: (x) => t('employees.deleteConfirm', { name: x.full_name }),
          onPress: remove,
        },
      ]}
    />
  );
}
