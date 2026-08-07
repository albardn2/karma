import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailAction, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useHasEndpoint } from '@/hooks/useModuleAccess';
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate, parseTs } from '@/utils/date';
import { round6 } from '@/utils/fifo';

interface Line {
  material_uuid?: string | null;
  quantity?: number | null;
  cost_per_unit?: number | null;
  total_cost?: number | null;
  inventory_uuid?: string | null;
}

interface Process {
  uuid: string;
  type?: string | null;
  notes?: string | null;
  created_at: string;
  workflow_execution_uuid?: string | null;
  data?: {
    cost_currency?: string | null;
    output_warehouse_uuid?: string | null;
    inputs?: Line[];
    outputs?: Line[];
  } | null;
}

interface Material {
  uuid: string;
  name?: string | null;
  measure_unit?: string | null;
}

const PER_PAGE = 100;

const qty = (n?: number | null) =>
  n == null ? '—' : Number.isInteger(n) ? String(n) : Number(n).toFixed(2);

/**
 * One production run: what went in, what came out.
 *
 * The lines carry material uuids only, so the materials table is pulled once and joined
 * here — the same pattern the price list uses, and for the same reason: the API has no
 * name on these rows and no way to ask for one.
 *
 * ONE SUBMITTED INPUT CAN APPEAR AS SEVERAL ROWS. The domain rebuilds data.inputs from
 * (material, quantity) by splitting the draw across FIFO lots, so a single "60 kg of
 * peanuts" becomes one row per lot it came out of, each with that lot's own
 * cost_per_unit. That is the real record of what was consumed, not a display quirk, so
 * the rows are shown as stored rather than re-merged per material — merging them would
 * hide that two lots had different costs.
 *
 * DELETING A RUN PUTS THE STOCK BACK, EXACTLY. Verified against the live API with a
 * full before/after diff of every lot: the produced lot is soft-deleted and each drawn
 * lot returns to its previous quantity, because current_quantity is a sum over
 * non-deleted events and delete soft-deletes this run's events. So delete is a genuine
 * undo — which is why it is offered.
 *
 * But the undo EXPIRES. Once anything downstream consumes the produced lot, delete
 * answers 404 and the whole operation rolls back, leaving the run alive and nothing
 * undone. The confirm therefore states what will be returned and to which lot, and the
 * failure path says the produced stock has already been used rather than showing a bare
 * not-found.
 */
export default function ProcessDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const { t, tef } = useLanguage();
  const [materials, setMaterials] = useState<Record<string, Material>>({});
  const [warehouse, setWarehouse] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const canUpdate = useHasEndpoint('process', 'update');
  const canDelete = useHasEndpoint('process', 'delete');

  const loadMaterials = useCallback(async () => {
    const res = await apiCall<{ materials: Material[] }>(`/material/?per_page=${PER_PAGE}`);
    if (!isOk(res.status)) return;
    const map: Record<string, Material> = {};
    for (const m of res.data?.materials ?? []) map[m.uuid] = m;
    setMaterials(map);
  }, []);

  useEffect(() => {
    loadMaterials();
  }, [loadMaterials]);

  // one request, and only when there is a warehouse to name
  const loadWarehouse = useCallback(async (id?: string | null) => {
    if (!id) return;
    const res = await apiCall<{ name?: string }>(`/warehouse/${id}`);
    if (isOk(res.status)) setWarehouse(res.data?.name ?? null);
  }, []);

  /**
   * The confirm names the lots and the amounts, in the direction the delete runs.
   *
   * Built from the STORED inputs, which are already lot-level — the server rewrote them
   * that way on create — so this is the actual ledger that will be reversed rather than
   * a reconstruction of what was typed.
   */
  const deleteConfirm = (p: Process) => {
    const back = (p.data?.inputs ?? []).map((l) =>
      t('processes.deleteReturns', {
        qty: String(round6(Number(l.quantity ?? 0))),
        unit: unitOf(l.material_uuid),
        lot: String(l.inventory_uuid ?? '').slice(0, 8),
      }),
    );
    const gone = (p.data?.outputs ?? []).map((l) =>
      t('processes.deleteRemoves', {
        qty: String(round6(Number(l.quantity ?? 0))),
        unit: unitOf(l.material_uuid),
        material: nameOf(l.material_uuid),
      }),
    );
    return [...back, ...gone].join('\n');
  };

  const remove = async () => {
    const res = await apiCall(`/process/${uuid}`, { method: 'DELETE' });
    if (isOk(res.status)) {
      router.back();
      return;
    }
    const raw = String(res.error ?? '').slice(0, 300);
    Alert.alert(
      t('processes.deleteTitle'),
      // a 404 here almost always means the produced lot has already been drawn from,
      // which is a real explanation rather than "not found"
      res.status === 404 && /inventory events/i.test(raw)
        ? t('processes.deleteUsed')
        : raw || t('processes.deleteFailed'),
    );
  };

  const actions: DetailAction<Process>[] = [
    {
      label: t('detail.edit'),
      testID: 'process-edit',
      visible: () => canUpdate,
      onPress: (p) => {
        setReloadKey((k) => k + 1);
        router.push({
          pathname: '/processes/edit',
          params: { uuid: p.uuid, notes: p.notes ?? '' },
        });
      },
    },
    {
      label: t('processes.uuid'),
      testID: 'process-copy',
      onPress: async (p) => {
        await Clipboard.setStringAsync(p.uuid);
        Alert.alert(t('processes.copied'));
      },
    },
    {
      label: t('detail.delete'),
      destructive: true,
      testID: 'process-delete',
      visible: () => canDelete,
      confirmText: (p) => `${deleteConfirm(p)}\n\n${t('processes.undoNote')}`,
      onPress: remove,
    },
  ];

  const nameOf = (u?: string | null) =>
    (u && materials[u]?.name) || t('inventory.unknownMaterial');
  const unitOf = (u?: string | null) => (u && materials[u]?.measure_unit) || '';

  const warehouseRow = (p: Process) => {
    const id = p.data?.output_warehouse_uuid;
    if (!id) return '—';
    if (warehouse === null) loadWarehouse(id);
    return warehouse ?? String(id).slice(0, 8);
  };

  const lines = (rows: Line[] | undefined, currency?: string | null, costKey: 'cost_per_unit' | 'total_cost' = 'cost_per_unit') => (
    <>
      {(rows ?? []).map((l, i) => (
        <View key={`${l.material_uuid}-${l.inventory_uuid ?? i}`} style={styles.line}>
          <View style={styles.lineLeft}>
            <ThemedText style={styles.name} numberOfLines={1}>
              {nameOf(l.material_uuid)}
            </ThemedText>
            <ThemedText style={styles.cost}>
              {l[costKey] != null
                ? `${qty(l[costKey])}${currency ? ` ${currency}` : ''}`
                : t('processes.noCost')}
            </ThemedText>
          </View>
          <ThemedText style={styles.qty}>
            {qty(l.quantity)}
            {unitOf(l.material_uuid) ? ` ${unitOf(l.material_uuid)}` : ''}
          </ThemedText>
        </View>
      ))}
    </>
  );

  return (
    <ModuleDetailScreen<Process>
      module="processes"
      title={t('menu.processes')}
      endpoint={`/process/${uuid}`}
      heading={(p) => (p.type ? tef(p.type) : t('menu.processes'))}
      rows={(p): DetailRow[] => [
        [
          t('processes.source'),
          p.workflow_execution_uuid ? t('processes.fromWorkflow') : t('processes.manual'),
        ],
        [t('processes.when'), p.created_at ? formatNumericDate(parseTs(p.created_at)) : '—'],
        [t('processes.costCurrency'), p.data?.cost_currency || '—'],
        [t('processes.warehouse'), warehouseRow(p)],
        [t('processes.notes'), p.notes || '—'],
      ]}
      actions={actions}
      reloadKey={reloadKey}
      sections={[
        {
          title: t('processes.inputs'),
          isEmpty: (p) => !p.data?.inputs?.length,
          emptyText: t('processes.noInputs'),
          render: (p) => lines(p.data?.inputs, p.data?.cost_currency, 'cost_per_unit'),
        },
        {
          title: t('processes.outputs'),
          isEmpty: (p) => !p.data?.outputs?.length,
          emptyText: t('processes.noOutputs'),
          render: (p) => lines(p.data?.outputs, p.data?.cost_currency, 'total_cost'),
        },
      ]}
      footer={(p) =>
        (p.data?.inputs?.length ?? 0) > 0 ? (
          <ThemedText style={styles.note}>{t('processes.fifoNote')}</ThemedText>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  lineLeft: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  cost: { fontSize: 11, opacity: 0.55, marginTop: 1 },
  qty: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  note: { fontSize: 11, opacity: 0.5, marginTop: 16, lineHeight: 16 },
});
