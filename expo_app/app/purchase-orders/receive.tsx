import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Receive one purchase-order line.
 *
 * POST /purchase-order-item/fulfill-items takes a batch — {items: [{…}]} — even for a
 * single line, so the flat answers this form collects are reshaped by `transform`.
 *
 * THE QUANTITY IS NOT ASKED FOR. There is no partial receipt: the event quantity is
 * always the full ordered quantity, and quantity_received is never written by any
 * backend code. An input here would imply a capability the server does not have, so
 * the ordered amount is shown as a note instead.
 *
 * DESTINATION IS EXACTLY ONE OF TWO. warehouse_uuid starts a new lot; inventory_uuid
 * adds to an existing one. Supplying neither is 400 "Either warehouse_uuid or
 * inventory_uuid must be provided.", so the choice is a required toggle and the
 * matching picker appears only for the branch chosen — a hidden required field would
 * otherwise block the form with an error pointing at nothing.
 *
 * One caveat the user cannot see and this screen does not pretend to fix: fulfilment
 * only creates inventory when the line's material is a raw_material. For other
 * material types the line is marked fulfilled and no stock appears, because the
 * handler map has a single entry. That is the server's behaviour, not something to
 * paper over client-side.
 */
export default function ReceiveLineScreen() {
  const { purchase_order_item_uuid, material_name, material_uuid, quantity, unit } =
    useLocalSearchParams<{
      purchase_order_item_uuid: string;
      material_name?: string;
      material_uuid?: string;
      quantity?: string;
      unit?: string;
    }>();
  const { t } = useLanguage();

  const fields: FormField[] = [
    {
      name: 'destination',
      label: t('purchaseOrders.destination'),
      required: true,
      kind: 'select',
      options: [
        { value: 'warehouse', label: t('purchaseOrders.intoWarehouse') },
        { value: 'inventory', label: t('purchaseOrders.intoLot') },
      ],
    },
    {
      name: 'warehouse_uuid',
      label: t('inventory.warehouse'),
      required: true,
      kind: 'picker',
      visibleWhen: (v) => v.destination === 'warehouse',
      picker: {
        endpoint: '/warehouse/',
        itemsKey: 'warehouses',
        // `name` is the only filter that suits a search box: WarehouseListParams
        // otherwise offers uuid (an exact match, useless for typing) and
        // within_polygon (a WKT geometry, not text)
        searchParam: 'name',
        label: (w) => w.name ?? '—',
        value: (w) => w.uuid,
        sublabel: (w) => w.address || undefined,
      },
    },
    {
      name: 'inventory_uuid',
      label: t('purchaseOrders.intoLot'),
      required: true,
      kind: 'picker',
      visibleWhen: (v) => v.destination === 'inventory',
      picker: {
        endpoint: '/inventory/',
        itemsKey: 'inventories',
        // /inventory/ has no lot_id filter (422), so the picker filters its first
        // page locally rather than sending a param that would fail the request.
        //
        // material_uuid IS a valid filter, and narrowing to it is not cosmetic: a lot
        // of the wrong material is 400 "Material not found in inventory", so an
        // unfiltered list offers mostly wrong answers.
        params: {
          is_active: 'true',
          ...(material_uuid ? { material_uuid } : {}),
        },
        label: (i) => i.lot_id ?? i.uuid,
        value: (i) => i.uuid,
        sublabel: (i) =>
          [i.material_name, i.current_quantity != null ? `${i.current_quantity}` : null]
            .filter(Boolean)
            .join(' · ') || undefined,
      },
    },
  ];

  const ordered = [quantity, unit].filter(Boolean).join(' ');

  return (
    <ModuleForm
      module="purchase-orders"
      title={material_name || t('purchaseOrders.receiveTitle')}
      note={
        ordered
          ? `${t('purchaseOrders.receivingQty', { qty: ordered })} ${t('purchaseOrders.fullQtyNote')}`
          : t('purchaseOrders.fullQtyNote')
      }
      fields={fields}
      extra={{ purchase_order_item_uuid }}
      transform={(b) => ({
        items: [
          {
            purchase_order_item_uuid: b.purchase_order_item_uuid,
            // exactly one — `destination` is a UI-only field and must not be sent
            ...(b.warehouse_uuid
              ? { warehouse_uuid: b.warehouse_uuid }
              : { inventory_uuid: b.inventory_uuid }),
          },
        ],
      })}
      method="POST"
      endpoint="/purchase-order-item/fulfill-items"
      // a driver holds the inventory module and the purchase-orders module and is
      // still 403 here, because fulfilment needs a purchase_order_item grant they do
      // not have. The detail screen hides the button on that basis; this covers the
      // case where the permission changed since the screen loaded.
      errorMessages={{ 403: t('purchaseOrders.receiveForbidden') }}
    />
  );
}
