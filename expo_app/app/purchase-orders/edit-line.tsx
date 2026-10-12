import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Correct one purchase-order line: how much was ordered, and at what price.
 *
 * There is no line endpoint for this. The write is the ORDER's own update —
 * PUT /purchase-order/<uuid> with purchase_order_items: [{uuid, quantity?,
 * price_per_unit?}] — so the flat answers are reshaped by `transform`. The line uuid
 * rides in that closure rather than in `extra`: an untouched form has to stay an empty
 * diff, which ModuleForm answers by going back instead of sending a pointless request.
 *
 * ON A RECEIVED LINE THE STOCK FOLLOWS. The server edits the line's receipt event in
 * place, so the lot's quantity moves with the ordered quantity, and the lot is priced
 * from the line on every read, so its cost per unit follows the price. A quantity cut
 * on a received line is therefore also a stock correction, and the note says so.
 *
 * 400 IS ONE OF THE SERVER'S GUARDS. The order's total may not drop below what has
 * been paid out on it, nor a line below what its credit/debit notes return or credit.
 * The server's message is English-only and arrives as a raw JSON body, so it is
 * replaced by one translated sentence that covers both. The bounds below (a whole
 * quantity of at least 1, a price of 0 or more — free goods are a real price) match the
 * DTO, so a 422 should never be reached from here.
 */
export default function EditLineScreen() {
  const { order_uuid, uuid, material_name, quantity, price_per_unit, unit, currency, received } =
    useLocalSearchParams<{
      order_uuid: string;
      uuid: string;
      material_name?: string;
      quantity?: string;
      price_per_unit?: string;
      unit?: string;
      currency?: string;
      received?: string;
    }>();
  const { t, tef } = useLanguage();

  const fields: FormField[] = [
    {
      name: 'quantity',
      label: unit ? `${t('purchaseOrders.quantity')} (${tef(unit)})` : t('purchaseOrders.quantity'),
      kind: 'number',
      required: true,
      integer: true,
      min: 1,
    },
    {
      name: 'price_per_unit',
      label: currency
        ? `${t('purchaseOrders.pricePerUnit')} (${currency})`
        : t('purchaseOrders.pricePerUnit'),
      kind: 'number',
      required: true,
      min: 0,
    },
  ];

  return (
    <ModuleForm
      module="purchase-orders"
      title={material_name || t('purchaseOrders.editLineTitle')}
      note={
        received === 'true'
          ? `${t('purchaseOrders.editLineNote')} ${t('purchaseOrders.editLineReceivedNote')}`
          : t('purchaseOrders.editLineNote')
      }
      fields={fields}
      initial={{ quantity: quantity ?? '', price_per_unit: price_per_unit ?? '' }}
      transform={(changed) => ({ purchase_order_items: [{ uuid, ...changed }] })}
      method="PUT"
      endpoint={`/purchase-order/${order_uuid}`}
      errorMessages={{
        400: t('purchaseOrders.editLineRefused'),
        403: t('purchaseOrders.forbidden'),
        404: t('purchaseOrders.lineGone'),
      }}
    />
  );
}
