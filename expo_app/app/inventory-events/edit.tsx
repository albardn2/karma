import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ModuleForm, FormField } from '@/components/ModuleForm';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * Edit a manual stock movement.
 *
 * QUANTITY IS HIDDEN ON AN OUTGOING MOVEMENT, not disabled, and that is the important
 * decision on this screen. The server requires a quantity greater than zero, so on a
 * movement that currently reads −40 every honest value is rejected and the only value it
 * will accept is a positive one — which silently un-zeroes the lot. A disabled field
 * still submits in some flows and still invites the attempt; a hidden field is not
 * rendered, not validated and not sent. Every sale and every zero-out lands in this
 * state, so this is the common case rather than an edge one, and the note explains why
 * the field is absent instead of leaving it a mystery.
 *
 * COST IS NEVER SENT AS NULL. The update DTO has no cost-pair validator — unlike create
 * and manual-add — so clearing the pair is accepted and the lot's cost silently becomes
 * unknown, and setting a cost while blanking the currency is accepted too, with the same
 * result. ModuleForm omits empty fields rather than nulling them, which prevents both by
 * construction; the cost consequently cannot be cleared from the app, and the note says
 * so. A currency-only save is deliberately still possible, because that is how a broken
 * pair gets repaired.
 */
export default function MovementEditScreen() {
  const { uuid, quantity, cost_per_unit, currency, affect_original, notes } =
    useLocalSearchParams<{
      uuid: string;
      quantity?: string;
      cost_per_unit?: string;
      currency?: string;
      affect_original?: string;
      notes?: string;
    }>();
  const { t, tef } = useLanguage();

  const isOutgoing = Number(quantity ?? 0) <= 0;

  const fields: FormField[] = [
    {
      name: 'quantity',
      label: t('inventory.quantity'),
      kind: 'number',
      min: 0.0001,
      // absent on an outgoing movement: the only savable value would reverse it
      visibleWhen: () => !isOutgoing,
    },
    { name: 'cost_per_unit', label: t('inventory.costPerUnit'), kind: 'number', min: 0 },
    {
      name: 'currency',
      label: t('financialAccounts.currency'),
      kind: 'select',
      options: ['USD', 'SYP'].map((v) => ({ value: v, label: tef(v) })),
    },
    {
      name: 'affect_original',
      label: t('inventoryEvents.affectsOriginal'),
      kind: 'boolean',
      options: [
        { value: 'true', label: t('common.yes') },
        { value: 'false', label: t('common.no') },
      ],
    },
    { name: 'notes', label: t('inventory.notes'), kind: 'multiline' },
  ];

  return (
    <ModuleForm
      module="inventory-events"
      title={t('inventoryEvents.editTitle')}
      note={
        isOutgoing
          ? `${t('inventoryEvents.quantityLocked')} ${t('inventoryEvents.costWarning')}`
          : t('inventoryEvents.costWarning')
      }
      fields={fields}
      initial={{
        quantity: quantity ?? '',
        cost_per_unit: cost_per_unit ?? '',
        currency: currency ?? '',
        affect_original: affect_original ?? 'false',
        notes: notes ?? '',
      }}
      method="PUT"
      endpoint={`/inventory-event/${uuid}`}
    />
  );
}
