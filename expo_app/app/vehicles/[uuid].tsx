import React, { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  vin?: string | null;
  notes?: string | null;
}

export default function VehiclesDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t, tef } = useLanguage();
  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);

  return (
    <ModuleDetailScreen<Vehicle>
      module="vehicles"
      title={t('menu.vehicles')}
      endpoint={`/vehicle/${uuid}`}
      reloadKey={reloadKey}
      heading={(x) => x.plate_number}
      rows={(x): DetailRow[] => [
        [t('vehicles.status'), x.status ? tef(x.status) : '—'],
        [t('vehicles.make'), x.make || '—'],
        [t('vehicles.model'), x.model || '—'],
        [t('vehicles.year'), x.year != null ? String(x.year) : '—'],
        [t('vehicles.color'), x.color || '—'],
        [t('vehicles.vin'), x.vin || '—'],
      ]}
      actions={[
        {
          label: t('detail.edit'),
          testID: 'vehicle-edit',
          onPress: (x) => {
            // bump on return so the record reflects the edit without a manual pull
            setReloadKey((k) => k + 1);
            router.push({
              pathname: '/vehicles/create',
              params: {
                uuid: x.uuid,
                plate_number: x.plate_number ?? '',
                make: x.make ?? '',
                model: x.model ?? '',
                year: x.year != null ? String(x.year) : '',
                color: x.color ?? '',
                status: x.status ?? '',
                vin: x.vin ?? '',
                notes: x.notes ?? '',
              },
            });
          },
        },
      ]}
    />
  );
}
