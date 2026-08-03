import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';

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
 * No actions. Deleting a process unwinds stock, and even the notes-only PUT rewrites the
 * stored cost blob, so neither belongs behind a one-handed tap in a van.
 */
export default function ProcessDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t, tef } = useLanguage();
  const [materials, setMaterials] = useState<Record<string, Material>>({});

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

  const nameOf = (u?: string | null) =>
    (u && materials[u]?.name) || t('inventory.unknownMaterial');
  const unitOf = (u?: string | null) => (u && materials[u]?.measure_unit) || '';

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
        [t('processes.when'), p.created_at ? formatNumericDate(new Date(p.created_at)) : '—'],
        [t('processes.costCurrency'), p.data?.cost_currency || '—'],
        [t('processes.notes'), p.notes || '—'],
      ]}
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
