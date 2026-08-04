import React, { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ModuleDetailScreen, DetailAction, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiCall, isOk } from '@/utils/api';
import { formatMonthDayTime, parseTs } from '@/utils/date';

interface InventoryEvent {
  uuid: string;
  event_type?: string | null;
  material_name?: string | null;
  quantity: number;
  created_at: string;
  notes?: string | null;
  cost_per_unit?: number | null;
  currency?: string | null;
  affect_original?: boolean | null;
  inventory_uuid?: string | null;
}

/**
 * One stock movement — the row that explains why a lot's quantity is what it is.
 *
 * Rewritten onto ModuleDetailScreen for the same reason the lot screen was: the previous
 * version hand-rolled its own chrome and so had nowhere to put an action.
 *
 * EDITING IS LIMITED TO MANUAL MOVEMENTS, matching both the web and the server: a sale or
 * a purchase-order movement is a consequence of that order, and the update DTO rejects
 * event_type, inventory_uuid, material_uuid and created_at outright — so a movement can
 * never be retyped or moved to another lot.
 *
 * Deleting a movement is admin-only and genuinely changes the lot's quantity, since the
 * quantity is the sum of its movements. That is why it is the documented undo for a
 * zero-out, and why the confirm says the balance will move rather than pretending this is
 * a tidy-up.
 */
export default function MovementDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const { t, tef } = useLanguage();
  const { isAdmin } = useAuth();
  const [lotId, setLotId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      setReloadKey((k) => k + 1);
    }, []),
  );

  // the event carries only inventory_uuid; the lot number is what a person recognises
  const resolveLot = useCallback(async (id?: string | null) => {
    if (!id) return;
    const res = await apiCall<{ lot_id?: string }>(`/inventory/${id}`);
    if (isOk(res.status)) setLotId(res.data?.lot_id ?? null);
  }, []);

  const qty = (n?: number | null) =>
    n == null ? '—' : Number.isInteger(n) ? String(n) : Number(n).toFixed(2);

  const remove = async () => {
    const res = await apiCall(`/inventory-event/${uuid}`, { method: 'DELETE' });
    if (isOk(res.status)) router.back();
    else
      Alert.alert(
        t('inventoryEvents.deleteFailed'),
        String(res.error ?? '').slice(0, 300) || t('form.tryAgain'),
      );
  };

  const rows = (e: InventoryEvent): DetailRow[] => {
    if (e.inventory_uuid && lotId === null) resolveLot(e.inventory_uuid);
    return [
      [t('inventoryEvents.type'), e.event_type ? tef(e.event_type) : '—'],
      [t('inventory.material'), e.material_name || t('inventory.unknownMaterial')],
      [t('inventory.lotId'), lotId ?? '—'],
      [
        t('inventoryEvents.costPerUnit'),
        e.cost_per_unit != null
          ? `${Number(e.cost_per_unit).toFixed(2)} ${e.currency ?? ''}`
          : t('inventory.costUnknown'),
      ],
      // what separates an opening balance from a correction, and why zeroing a lot
      // leaves its cost intact
      [
        t('inventoryEvents.affectsOriginal'),
        e.affect_original === true ? t('common.yes') : t('common.no'),
      ],
      [t('inventoryEvents.when'), formatMonthDayTime(parseTs(e.created_at))],
      [t('inventory.notes'), e.notes || '—'],
      [t('materials.uuid'), e.uuid],
    ];
  };

  const actions: DetailAction<InventoryEvent>[] = [
    {
      label: t('inventoryEvents.viewLot'),
      testID: 'movement-view-lot',
      visible: (e) => !!e.inventory_uuid,
      onPress: (e) => router.push(`/inventory/${e.inventory_uuid}`),
    },
    {
      label: t('detail.edit'),
      testID: 'movement-edit',
      // only a manual movement is editable — the server rejects the rest by omission
      visible: (e) => e.event_type === 'manual',
      onPress: (e) =>
        router.push({
          pathname: '/inventory-events/edit',
          params: {
            uuid: e.uuid,
            quantity: String(e.quantity ?? ''),
            cost_per_unit: e.cost_per_unit != null ? String(e.cost_per_unit) : '',
            currency: e.currency ?? '',
            affect_original: String(!!e.affect_original),
            notes: e.notes ?? '',
          },
        }),
    },
    {
      label: t('detail.delete'),
      destructive: true,
      confirmText: t('inventoryEvents.deleteConfirm'),
      testID: 'movement-delete',
      visible: () => isAdmin,
      onPress: remove,
    },
  ];

  return (
    <ModuleDetailScreen<InventoryEvent>
      module="inventory-events"
      title={t('menu.inventoryEvents')}
      endpoint={`/inventory-event/${uuid}`}
      reloadKey={reloadKey}
      heading={(e) =>
        `${Number(e.quantity) > 0 ? '+' : ''}${qty(e.quantity)}`
      }
      rows={rows}
      actions={actions}
    />
  );
}
