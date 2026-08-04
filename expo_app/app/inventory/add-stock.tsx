import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Create a lot with its opening quantity, from the inventory module.
 *
 * The third add-stock screen, and the only one with both pickers: the warehouse variant
 * fixes the warehouse, the material variant fixes the material, and from the inventory
 * list neither is fixed. It also accepts either as a router param so the lot detail can
 * pre-fill both sides.
 *
 * It posts to manual-add rather than the plain create, and that is the whole reason this
 * screen exists rather than wiring the web's "Add Inventory" dialog. The plain create
 * takes no quantity and no cost, so it makes a lot at zero with no cost — and because the
 * lot number is unique globally and forever, with no account scoping and no exemption for
 * soft-deleted rows, a throwaway lot burns that number permanently. manual-add writes the
 * lot and its opening movement in one transaction.
 *
 * lot_id is REQUIRED here even though the server can generate one, because the generator
 * stamps a whole second of resolution into a globally unique column: two lots added in the
 * same second collide with a bare 409. Typing a lot number is the escape hatch, so it is
 * the field rather than the fallback.
 */
export default function InventoryAddStockScreen() {
  const { material_uuid, material_name, warehouse_uuid, warehouse_name } =
    useLocalSearchParams<{
      material_uuid?: string;
      material_name?: string;
      warehouse_uuid?: string;
      warehouse_name?: string;
    }>();
  const { t, tef } = useLanguage();

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
      pickerInitialLabel: material_name || undefined,
    },
    {
      name: 'warehouse_uuid',
      label: t('inventory.warehouse'),
      required: true,
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
    { name: 'quantity', label: t('inventory.quantity'), required: true, kind: 'number', min: 0.0001 },
    // required, not optional: see the docstring — the generated ids collide
    { name: 'lot_id', label: t('inventory.lotId'), required: true },
    { name: 'cost_per_unit', label: t('inventory.costPerUnit'), kind: 'number', min: 0 },
    {
      name: 'currency',
      label: t('financialAccounts.currency'),
      kind: 'select',
      options: ['USD', 'SYP'].map((v) => ({ value: v, label: tef(v) })),
      // a cost without a currency is the one combination the server refuses, and it
      // answers with a 400 rather than a field-level 422 — so require it here instead
      required: false,
    },
    {
      name: 'expiration_date',
      label: t('inventory.expiry'),
      placeholder: 'YYYY-MM-DD',
    },
    { name: 'notes', label: t('inventory.notes'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="inventory"
      title={t('inventory.addLot')}
      fields={fields}
      initial={{
        material_uuid: material_uuid ?? '',
        warehouse_uuid: warehouse_uuid ?? '',
      }}
      transform={(body) => {
        const out = { ...body };
        // NAIVE local midnight, no Z and no offset: on this route an offset is
        // honoured, so +03:00 midnight stores as the previous day's 21:00 and the
        // expiry silently reads a day early
        if (typeof out.expiration_date === 'string' && out.expiration_date.trim()) {
          out.expiration_date = `${out.expiration_date.trim()}T00:00:00`;
        }
        return out;
      }}
      method="POST"
      endpoint="/inventory/manual-add"
    />
  );
}
