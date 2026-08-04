import React, { useCallback, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailAction, DetailRow } from '@/components/ModuleDetailScreen';
import { CostCurrencyToggle, CostCcy } from '@/components/CostCurrencyToggle';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiCall, isOk } from '@/utils/api';
import { formatMonthDayTime, formatNumericDate, parseTs, plainDate } from '@/utils/date';

interface Lot {
  uuid: string;
  lot_id: string;
  material_uuid?: string | null;
  material_name?: string | null;
  unit?: string | null;
  current_quantity: number;
  original_quantity: number;
  cost_per_unit?: number | null;
  total_original_cost?: number | null;
  cost_currency?: string | null;
  warehouse_uuid?: string | null;
  expiration_date?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at: string;
  created_by_uuid?: string | null;
}

interface Movement {
  uuid: string;
  event_type: string;
  quantity: number;
  cost_per_unit?: number | null;
  currency?: string | null;
  created_at: string;
}

/**
 * One lot of stock: what it holds, what it cost, how it got there, and what can be done
 * about it.
 *
 * Rewritten onto ModuleDetailScreen. The previous version hand-rolled its own top bar,
 * loading and failure states, which is exactly why it had nowhere to put an action — the
 * whole module was read-only. It also showed "Couldn't load this list" on a single record.
 *
 * COST IS REPORTED, NOT STORED. Neither cost_per_unit nor total_original_cost is a
 * column; both are derived from this lot's own movements and converted into whichever
 * currency the toggle asks for. Two consequences the labels have to respect. A cost of
 * 0.00 is a real recorded cost and is not the same fact as "not recorded", so every
 * check here is `!= null` rather than falsy. And total_original_cost is cost × ORIGINAL
 * quantity — what the lot cost on arrival, not what the remaining stock is worth — so it
 * is labelled receipt value, and the worth of what is actually on hand is computed
 * separately from cost × current.
 *
 * Deleting a lot is admin-only AND refused once it has any movement, which in practice
 * is every real lot. So the button appears only where it can succeed, and the refusal
 * points at zero-out, which keeps both the history and the cost.
 */
export default function LotDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const { t, tef } = useLanguage();
  const { isAdmin } = useAuth();
  const [ccy, setCcy] = useState<CostCcy>('USD');
  const [reloadKey, setReloadKey] = useState(0);
  const [whName, setWhName] = useState<string | null>(null);
  const [moves, setMoves] = useState<Movement[] | null>(null);

  const qty = (n?: number | null) =>
    n == null ? '—' : Number.isInteger(n) ? String(n) : Number(n).toFixed(2);
  const money = (n?: number | null, c?: string | null) =>
    n == null ? t('inventory.costUnknown') : `${Number(n).toFixed(2)} ${c ?? ccy}`;

  // this lot's own movements — inventory_uuid IS a real applied filter here, unlike
  // material_uuid on the same route, which 422s
  const loadMoves = useCallback(async () => {
    const res = await apiCall<{ events: Movement[] }>(
      `/inventory-event/?inventory_uuid=${uuid}&page=1&per_page=100`,
    );
    if (isOk(res.status)) setMoves(res.data?.events ?? []);
    else setMoves((prev) => prev ?? []);
  }, [uuid]);

  const resolveWarehouse = useCallback(async (id?: string | null) => {
    if (!id) return;
    const res = await apiCall<{ name?: string }>(`/warehouse/${id}`);
    if (isOk(res.status)) setWhName(res.data?.name ?? null);
  }, []);

  // focus, not mount: edit, add-stock and zero-out all change what this shows, and a
  // stack pop does not remount
  useFocusEffect(
    useCallback(() => {
      loadMoves();
      setReloadKey((k) => k + 1);
    }, [loadMoves]),
  );

  const moveCount = (moves ?? []).length;

  const zeroOut = (l: Lot) =>
    Alert.alert(t('materials.zeroOut'), t('materials.zeroOutConfirm', { lot: l.lot_id }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('materials.zeroOut'),
        style: 'destructive',
        onPress: async () => {
          // the delta is computed server-side from the lot's own events, so a stale
          // screen cannot overshoot — and a negative lot is corrected upward
          const res = await apiCall(`/inventory/${uuid}/zero-out`, {
            method: 'POST',
            body: JSON.stringify({}),
          });
          if (isOk(res.status)) {
            loadMoves();
            setReloadKey((k) => k + 1);
          } else if (res.status === 400) {
            Alert.alert(t('materials.zeroOut'), t('inventory.alreadyZero'));
          } else {
            Alert.alert(
              t('materials.zeroOutFailed'),
              String(res.error ?? '').slice(0, 300) || t('form.tryAgain'),
            );
          }
        },
      },
    ]);

  const remove = async () => {
    const res = await apiCall(`/inventory/${uuid}`, { method: 'DELETE' });
    if (isOk(res.status)) {
      router.replace('/inventory');
      return;
    }
    // a business rule wearing a 404: the lot still has movements
    if (res.status === 404) Alert.alert(t('detail.delete'), t('inventory.deleteBlocked'));
    else
      Alert.alert(
        t('inventory.deleteFailed'),
        String(res.error ?? '').slice(0, 300) || t('form.tryAgain'),
      );
  };

  const rows = (l: Lot): DetailRow[] => {
    if (l.warehouse_uuid && whName === null) resolveWarehouse(l.warehouse_uuid);
    return [
      [t('inventory.warehouse'), whName ?? t('materials.unknownWarehouse')],
      [t('inventory.lotId'), l.lot_id],
      [t('inventory.current'), `${qty(l.current_quantity)}${l.unit ? ` ${l.unit}` : ''}`],
      [t('inventory.original'), `${qty(l.original_quantity)}${l.unit ? ` ${l.unit}` : ''}`],
      [t('inventory.costPerUnit'), money(l.cost_per_unit, l.cost_currency)],
      [
        t('inventory.valueOnHand'),
        l.cost_per_unit != null && Number(l.current_quantity) > 0
          ? `${(Number(l.cost_per_unit) * Number(l.current_quantity)).toFixed(2)} ${
              l.cost_currency ?? ccy
            }`
          : '—',
      ],
      [t('inventory.receiptValue'), money(l.total_original_cost, l.cost_currency)],
      [t('inventory.expiry'), l.expiration_date ? plainDate(l.expiration_date.slice(0, 10)) : '—'],
      [t('inventory.received'), formatNumericDate(parseTs(l.created_at))],
      [t('inventory.createdBy'), l.created_by_uuid ?? '—'],
      [t('inventory.notes'), l.notes || '—'],
      [t('materials.uuid'), l.uuid],
    ];
  };

  const actions: DetailAction<Lot>[] = [
    {
      label: t('inventory.addStock'),
      testID: 'lot-add-stock',
      onPress: (l) =>
        router.push({
          pathname: '/inventory/add-stock',
          params: {
            material_uuid: l.material_uuid ?? '',
            material_name: l.material_name ?? '',
            warehouse_uuid: l.warehouse_uuid ?? '',
            warehouse_name: whName ?? '',
          },
        }),
    },
    {
      label: t('detail.edit'),
      testID: 'lot-edit',
      onPress: (l) =>
        router.push({
          pathname: '/inventory/edit',
          params: {
            uuid: l.uuid,
            lot_id: l.lot_id,
            warehouse_uuid: l.warehouse_uuid ?? '',
            warehouse_name: whName ?? '',
            notes: l.notes ?? '',
            expiration_date: l.expiration_date ? l.expiration_date.slice(0, 10) : '',
            is_active: String(l.is_active),
          },
        }),
    },
    {
      label: t('materials.zeroOut'),
      destructive: true,
      testID: 'lot-zero-out',
      // `!== 0`, not `> 0`: the same call corrects a negative lot upward
      visible: (l) => Number(l.current_quantity) !== 0,
      onPress: zeroOut,
    },
    {
      label: t('detail.delete'),
      destructive: true,
      confirmText: t('inventory.deleteConfirmShort'),
      testID: 'lot-delete',
      // admin-only server-side, and refused once the lot has any movement — which is
      // every real lot. Showing it otherwise ships a button that always fails.
      visible: () => isAdmin && moveCount === 0,
      onPress: remove,
    },
  ];

  return (
    <ModuleDetailScreen<Lot>
      module="inventory"
      title={t('menu.inventory')}
      // the reporting currency rides in the query string, and the scaffold keys its
      // fetch on `endpoint` — so flipping the toggle refetches by itself
      endpoint={`/inventory/${uuid}?cost_currency=${ccy}`}
      reloadKey={reloadKey}
      heading={(l) => l.material_name || t('inventory.unknownMaterial')}
      subheading={(l) => (
        <View style={styles.sub}>
          <CostCurrencyToggle value={ccy} onChange={setCcy} testIDPrefix="lot" />
          {!l.is_active && (
            <ThemedText style={styles.inactive}>{t('inventory.inactive')}</ThemedText>
          )}
        </View>
      )}
      rows={rows}
      sections={[
        {
          title: t('inventory.movements'),
          isEmpty: () => !moves?.length,
          emptyText: t('inventory.noMovements'),
          render: () => (
            <>
              {(moves ?? []).map((m) => (
                <TouchableOpacity
                  key={m.uuid}
                  style={styles.move}
                  onPress={() => router.push(`/inventory-events/${m.uuid}`)}
                  testID={`lot-move-${m.uuid}`}
                >
                  <View style={styles.moveLeft}>
                    <ThemedText style={styles.moveType}>{tef(m.event_type)}</ThemedText>
                    <ThemedText style={styles.moveMeta}>
                      {formatMonthDayTime(parseTs(m.created_at))}
                      {m.cost_per_unit != null
                        ? ` · ${Number(m.cost_per_unit).toFixed(2)} ${m.currency ?? ''}`
                        : ''}
                    </ThemedText>
                  </View>
                  <ThemedText
                    style={[
                      styles.moveQty,
                      Number(m.quantity) < 0 ? styles.moveOut : styles.moveIn,
                    ]}
                  >
                    {Number(m.quantity) > 0 ? '+' : ''}
                    {qty(m.quantity)}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </>
          ),
        },
      ]}
      actions={actions}
    />
  );
}

const styles = StyleSheet.create({
  sub: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' },
  inactive: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4b5563',
    backgroundColor: '#f3f4f6',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
  move: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  moveLeft: { flex: 1 },
  moveType: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  moveMeta: { fontSize: 11, opacity: 0.55, marginTop: 1 },
  moveQty: { fontSize: 14, fontWeight: '700' },
  moveIn: { color: '#166534' },
  moveOut: { color: '#991b1b' },
});
