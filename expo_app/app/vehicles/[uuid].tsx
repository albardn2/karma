import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';

interface Vehicle {
  uuid: string;
  plate_number: string;
  status?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
}

export default function VehiclesDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t, tef } = useLanguage();

  return (
    <ModuleDetailScreen<Vehicle>
      module="vehicles"
      title={t('menu.vehicles')}
      endpoint={`/vehicle/${uuid}`}
      heading={(x) => x.plate_number}
      rows={(x): DetailRow[] => [
        [t('vehicles.status'), x.status ? tef(x.status) : '—'],
        [t('vehicles.make'), x.make || '—'],
        [t('vehicles.model'), x.model || '—'],
        [t('vehicles.year'), x.year != null ? String(x.year) : '—'],
        [t('vehicles.color'), x.color || '—'],
      ]}
    />
  );
}
