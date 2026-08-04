import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Edit a purchase order — which means its notes and its payout due date, and nothing
 * else.
 *
 * That is not a simplification for the phone: PurchaseOrderUpdate is extra="forbid" and
 * declares exactly those two fields, so vendor_uuid, currency, status and
 * purchase_order_items each 422 the request. An order's commercial terms are frozen the
 * moment it is created, and the note above the fields says so rather than leaving a
 * user to discover it from a rejection.
 *
 * THE CLEAR-DATE SWITCH EXISTS BECAUSE AN EMPTY FIELD CANNOT CLEAR A COLUMN.
 * ModuleForm omits empty values from the payload rather than sending null — the right
 * default, since several update DTOs reject "" for a typed field. But it means blanking
 * the due date is indistinguishable from not touching it. The server does accept an
 * explicit null, so removal gets its own affirmative control, shown only when there is
 * a date to remove.
 */
export default function PurchaseOrderEditScreen() {
  const { uuid, notes, due } = useLocalSearchParams<{
    uuid: string;
    notes?: string;
    due?: string;
  }>();
  const { t } = useLanguage();

  const initialDue = (due ?? '').slice(0, 10);

  const fields: FormField[] = [
    { name: 'notes', label: t('purchaseOrders.notes'), kind: 'multiline' },
    {
      name: 'payout_due_date',
      label: t('purchaseOrders.dueDate'),
      placeholder: 'YYYY-MM-DD',
      visibleWhen: (v) => v.clear_due !== 'true',
    },
    {
      name: 'clear_due',
      label: t('purchaseOrders.clearDueDate'),
      kind: 'boolean',
      options: [
        { value: 'true', label: t('common.yes') },
        { value: 'false', label: t('common.no') },
      ],
      visibleWhen: () => !!initialDue,
    },
  ];

  return (
    <ModuleForm
      module="purchase-orders"
      title={t('purchaseOrders.editTitle')}
      note={t('purchaseOrders.editNote')}
      fields={fields}
      initial={{ notes: notes ?? '', payout_due_date: initialDue, clear_due: 'false' }}
      transform={(body) => {
        const out = { ...body };
        // an affirmative clear beats whatever is in the date field
        if (out.clear_due === true) {
          out.payout_due_date = null;
        } else if (typeof out.payout_due_date === 'string' && out.payout_due_date.trim()) {
          // naive local midnight — a numeric offset is honoured on this column and
          // would store a different instant than the one that was typed
          out.payout_due_date = `${out.payout_due_date.trim()}T00:00:00`;
        }
        delete out.clear_due;
        return out;
      }}
      method="PUT"
      endpoint={`/purchase-order/${uuid}`}
      errorMessages={{
        403: t('purchaseOrders.forbidden'),
        404: t('purchaseOrders.gone'),
      }}
    />
  );
}
