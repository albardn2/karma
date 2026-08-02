import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';

interface Warehouse {
  uuid: string;
  name: string;
  address?: string | null;
  notes?: string | null;
}

export default function WarehousesDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t } = useLanguage();

  return (
    <ModuleDetailScreen<Warehouse>
      module="warehouses"
      title={t('menu.warehouses')}
      endpoint={`/warehouse/${uuid}`}
      heading={(x) => x.name}
      rows={(x): DetailRow[] => [
        [t('warehouses.address'), x.address || '—'],
        [t('warehouses.notes'), x.notes || '—'],
      ]}
    />
  );
}
