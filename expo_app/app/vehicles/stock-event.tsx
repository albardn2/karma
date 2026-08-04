import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Load, unload or correct one material's balance on a vehicle.
 *
 * The three movement types are not interchangeable, and the server enforces the
 * difference: load and unload both take a POSITIVE amount and the domain applies the
 * sign, while a correction is signed and may be negative. Zero is refused outright for
 * all three. So the quantity field carries no minimum — a correction of -20 is a legal
 * body, and a min of 0 would block the one case that needs it.
 *
 * Taking more off than the van holds is refused with the balance quoted back. Loading
 * ONTO an already-negative van is allowed, which sounds wrong and is not: a negative
 * balance means more was sold than was recorded as loaded, and loading is how that gets
 * corrected.
 *
 * The current balance rides in the note so it is on screen while the number is being
 * typed. Without it this is a form that asks "how much" with no way to see how much
 * there is.
 *
 * `sale` is a fourth event type the API will happily accept from any client — it is not
 * system-only, whatever the UI convention suggests. It is deliberately absent here: a
 * sale belongs to a customer order and a trip stop, and one entered by hand would be
 * revenue with nothing attached to it.
 */
export default function VehicleStockEventScreen() {
  const { vehicle_inventory_uuid, material_name, unit, on_hand } = useLocalSearchParams<{
    vehicle_inventory_uuid: string;
    material_name?: string;
    unit?: string;
    on_hand?: string;
  }>();
  const { t } = useLanguage();

  const balance = `${on_hand ?? '0'}${unit ? ` ${unit}` : ''}`;

  const fields: FormField[] = [
    {
      name: 'event_type',
      label: t('vehicles.movement'),
      required: true,
      kind: 'select',
      options: [
        { value: 'manual', label: t('vehicles.eventManual') },
        { value: 'unload', label: t('vehicles.eventUnload') },
        { value: 'adjustment', label: t('vehicles.eventAdjust') },
      ],
    },
    {
      name: 'quantity',
      label: t('inventory.quantity'),
      required: true,
      kind: 'number',
      // no min: a correction is signed and may legitimately be negative
    },
  ];

  return (
    <ModuleForm
      module="vehicles"
      title={
        material_name ? t('vehicles.updateStock', { material: material_name }) : t('inventory.quantity')
      }
      note={`${t('inventory.current')}: ${balance} — ${t('vehicles.qtyNote')}`}
      fields={fields}
      extra={{ vehicle_inventory_uuid }}
      method="POST"
      endpoint="/vehicle-inventory-event/"
      // the server refuses an over-decrement with the balance quoted in its own words;
      // this says the same thing in the app's
      errorMessages={{ 400: t('vehicles.insufficient') }}
    />
  );
}
