import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Add a lot of stock of THIS material — the mirror of warehouses/add-stock, with the
 * roles swapped: the material is fixed (this is reached from its detail screen) and
 * travels in `extra`; the warehouse is picked. Same endpoint, same one-transaction
 * reasoning, same untrustworthy response body — see that file's docstring; everything
 * it says about /inventory/manual-add applies here verbatim.
 *
 * expiration_date is sent as a NAIVE local midnight — `YYYY-MM-DDT00:00:00`, no Z and
 * no offset. The column is a naive timestamp, and an offset is not ignored: +03:00
 * midnight is stored as the previous day's 21:00, silently shifting the expiry date a
 * day early. A plain date with T00:00:00 appended round-trips exactly.
 */
export default function MaterialAddStockScreen() {
  const { material_uuid, material_name } = useLocalSearchParams<{
    material_uuid: string;
    material_name?: string;
  }>();
  const { t, tef } = useLanguage();

  const fields: FormField[] = [
    {
      name: 'warehouse_uuid',
      label: t('inventory.warehouse'),
      required: true,
      kind: 'picker',
      picker: {
        endpoint: '/warehouse/',
        itemsKey: 'warehouses',
        // `name` is a real WarehouseListParams field — verified live before shipping,
        // because the list DTOs are extra="forbid" and a guessed param would 422 the
        // picker into permanent emptiness
        searchParam: 'name',
        label: (w) => w.name ?? '—',
        value: (w) => w.uuid,
      },
    },
    { name: 'quantity', label: t('inventory.quantity'), required: true, kind: 'number' },
    // optional: the server generates one, but its generated ids have one-second
    // resolution and are globally unique, so two adds in the same second collide with
    // a 409 — typing an explicit lot id is the escape hatch
    { name: 'lot_id', label: t('inventory.lotId') },
    { name: 'cost_per_unit', label: t('inventory.costPerUnit'), kind: 'number' },
    {
      name: 'currency',
      label: t('financialAccounts.currency'),
      kind: 'select',
      // USD/SYP only: the web offers EUR and TRY here and both 422 live — a broken
      // option list is not a feature to inherit
      options: ['USD', 'SYP'].map((v) => ({ value: v, label: tef(v) })),
    },
    {
      name: 'expiration_date',
      label: t('inventory.expiry'),
      placeholder: 'YYYY-MM-DD',
    },
    { name: 'notes', label: t('warehouses.notes'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="inventory"
      title={
        material_name
          ? t('materials.addStockFor', { what: material_name })
          : t('inventory.addStock')
      }
      fields={fields}
      extra={{ material_uuid }}
      transform={(body) => {
        if (typeof body.expiration_date === 'string' && body.expiration_date.trim()) {
          return { ...body, expiration_date: `${body.expiration_date.trim()}T00:00:00` };
        }
        return body;
      }}
      method="POST"
      endpoint="/inventory/manual-add"
    />
  );
}
