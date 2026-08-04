import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Add a lot of stock to a warehouse.
 *
 * POST /inventory/manual-add creates the inventory row AND its opening event in one
 * transaction. The two-call alternative (POST /inventory/ then POST /inventory-event/)
 * is a trap the backend added this endpoint to close: a lot created without its event
 * has a current_quantity of 0, so it is invisible in every stock view while still
 * holding its globally-unique lot_id. The web app only ever uses manual-add, and so
 * does this.
 *
 * The warehouse is fixed — this is reached from that warehouse — and travels in
 * `extra` rather than being re-chosen. Only the material is picked, and it is a picker
 * rather than chips because a materials table is unbounded.
 *
 * cost_per_unit and currency are coupled: sending a cost without a currency is 400
 * "currency is required when cost_per_unit is set". Both are optional, but choosing
 * one without the other is the one combination the server rejects, so the currency
 * defaults alongside the cost input rather than being left to chance.
 *
 * DO NOT TRUST THE RESPONSE BODY'S QUANTITY. A successful 201 reports
 * inventory.current_quantity as 0.0, because that field is a hybrid property summed
 * over events and the response is serialised before the opening event is visible to
 * it — re-reading the lot gives the real 5.0. Nothing here echoes the response back;
 * the screen returns and the warehouse refetches, which is the only honest way to
 * show what was actually stored.
 */
export default function AddStockScreen() {
  const { warehouse_uuid, warehouse_name } = useLocalSearchParams<{
    warehouse_uuid: string;
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
        // `name` is a real MaterialListParams field; the DTO is extra="forbid", so a
        // guessed param name would 422 the picker into permanent emptiness
        searchParam: 'name',
        label: (m) => m.name ?? '—',
        value: (m) => m.uuid,
        sublabel: (m) => [m.sku, m.measure_unit ?? m.unit].filter(Boolean).join(' · ') || undefined,
      },
    },
    { name: 'quantity', label: t('inventory.quantity'), required: true, kind: 'number' },
    { name: 'lot_id', label: t('inventory.lotId') },
    { name: 'cost_per_unit', label: t('inventory.costPerUnit'), kind: 'number' },
    {
      name: 'currency',
      label: t('financialAccounts.currency'),
      kind: 'select',
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
        warehouse_name
          ? t('inventory.addStockTo', { where: warehouse_name })
          : t('inventory.addStock')
      }
      fields={fields}
      extra={{ warehouse_uuid }}
      transform={(body) => {
        // NAIVE local midnight, no Z and no offset: the column is a naive timestamp
        // and an offset is honoured — +03:00 midnight stores as the previous day's
        // 21:00, silently shifting the expiry a day early
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
