import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Edit a lot. Exactly four fields, because the update DTO accepts exactly four.
 *
 * Everything else on the record is frozen and deliberately not rendered: the lot number,
 * the material, the unit, both quantities and every cost figure. Echoing the read model
 * back is a 422 naming fourteen rejected keys, and that is the right behaviour — a lot's
 * quantity is the sum of its movements, so it is changed by adding a movement, not by
 * typing over it.
 *
 * BLANK MEANS KEEP, NOT CLEAR, and that is a deliberate trade rather than an oversight.
 * ModuleForm sends only the fields the user actually changed and drops empty ones, which
 * is what stops this screen from reproducing the web's data loss — there, saving the form
 * sends `notes: null` and `expiration_date: null` for every field left untouched, and the
 * server accepts both. The cost is that notes and expiry cannot be emptied from the app.
 * For a screen used one-handed in a warehouse that is the correct direction to fail, and
 * the note says so out loud.
 *
 * The warehouse is a picker, never a text box: this route validates warehouse_uuid with
 * nothing but the Postgres foreign key, so a wrong value comes back as a bare 409 rather
 * than "no such warehouse" — and unlike the add-stock route it does no tenant check at
 * all. A picker fed from the tenant's own warehouses is the only safe input.
 */
export default function LotEditScreen() {
  const { uuid, lot_id, warehouse_uuid, warehouse_name, notes, expiration_date, is_active } =
    useLocalSearchParams<{
      uuid: string;
      lot_id?: string;
      warehouse_uuid?: string;
      warehouse_name?: string;
      notes?: string;
      expiration_date?: string;
      is_active?: string;
    }>();
  const { t } = useLanguage();

  const fields: FormField[] = [
    {
      name: 'warehouse_uuid',
      label: t('inventory.warehouse'),
      kind: 'picker',
      picker: {
        endpoint: '/warehouse/',
        itemsKey: 'warehouses',
        searchParam: 'name',
        label: (w) => w.name ?? '—',
        value: (w) => w.uuid,
      },
      pickerInitialLabel: warehouse_name || undefined,
    },
    {
      name: 'expiration_date',
      label: t('inventory.expiry'),
      placeholder: 'YYYY-MM-DD',
    },
    {
      name: 'is_active',
      label: t('inventory.active'),
      kind: 'boolean',
      options: [
        { value: 'true', label: t('inventory.active') },
        { value: 'false', label: t('inventory.inactive') },
      ],
    },
    { name: 'notes', label: t('inventory.notes'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="inventory"
      title={t('inventory.editTitle', { lot: lot_id ?? '' })}
      note={t('inventory.clearNote')}
      fields={fields}
      initial={{
        warehouse_uuid: warehouse_uuid ?? '',
        expiration_date: expiration_date ?? '',
        is_active: is_active ?? 'true',
        notes: notes ?? '',
      }}
      transform={(body) => {
        // naive local midnight. On THIS route an offset is dropped rather than
        // honoured, but add-stock shifts the stored date by it — sending the same
        // naive form on both paths is what makes them agree.
        if (typeof body.expiration_date === 'string' && body.expiration_date.trim()) {
          return { ...body, expiration_date: `${body.expiration_date.trim()}T00:00:00` };
        }
        return body;
      }}
      method="PUT"
      endpoint={`/inventory/${uuid}`}
    />
  );
}
