import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Put a material onto a vehicle — the line, not the quantity.
 *
 * This creates the vehicle-inventory row at a balance of zero; loading an amount onto
 * it is a separate movement, on the stock-event screen. That two-step shape is the
 * API's, not a choice: POST /vehicle-inventory/ takes no quantity, and the balance is
 * a derived sum over that line's events. The note says so, because a form that asks
 * for a material and then reports success with nothing on the truck would otherwise
 * read as broken.
 *
 * THIS is the one screen in the vehicle module where the material CATALOGUE is the
 * right source — everywhere else the picker must come from the vehicle's own lots,
 * because everywhere else you are acting on something already aboard. Here you are
 * adding something that by definition is not.
 *
 * One material per vehicle: a unique index on (vehicle_uuid, material_uuid) for live
 * rows means a repeat is a 400, so the duplicate case gets its own message rather
 * than the server's phrasing.
 *
 * Gated on the module, not on admin: a driver holds vehicle_inventory create, which is
 * exactly the point — loading a van is the driver's job.
 */
export default function VehicleAddMaterialScreen() {
  const { vehicle_uuid, plate_number } = useLocalSearchParams<{
    vehicle_uuid: string;
    plate_number?: string;
  }>();
  const { t } = useLanguage();

  const fields: FormField[] = [
    {
      name: 'material_uuid',
      label: t('inventory.material'),
      required: true,
      kind: 'picker',
      picker: {
        endpoint: '/material/',
        itemsKey: 'materials',
        searchParam: 'name',
        label: (m) => m.name ?? '—',
        value: (m) => m.uuid,
        sublabel: (m) =>
          [m.sku, m.measure_unit ?? m.unit].filter(Boolean).join(' · ') || undefined,
      },
    },
    { name: 'notes', label: t('warehouses.notes'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="vehicles"
      title={
        plate_number
          ? t('vehicles.addMaterialTo', { plate: plate_number })
          : t('vehicles.addMaterial')
      }
      note={t('vehicles.addMaterialNote')}
      fields={fields}
      extra={{ vehicle_uuid }}
      // unit is copied server-side from the material's own measure_unit — sending one
      // is not just redundant, it would be a second source of truth for the same fact
      method="POST"
      endpoint="/vehicle-inventory/"
      errorMessages={{ 400: t('vehicles.materialAlreadyOn') }}
    />
  );
}
