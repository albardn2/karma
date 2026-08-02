import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';

interface Material {
  uuid: string;
  name: string;
  sku?: string | null;
  measure_unit?: string | null;
  type?: string | null;
  description?: string | null;
  created_at: string;
}

interface Lot {
  uuid: string;
  lot_id: string;
  current_quantity: number;
  unit?: string | null;
  warehouse_uuid?: string | null;
  cost_per_unit?: number | null;
  cost_currency?: string | null;
  expiration_date?: string | null;
}

/**
 * A material, and where its stock actually sits.
 *
 * Quantities ARE summed here, unlike on the warehouse screen — every lot of one
 * material shares that material's unit, so a total is meaningful. Across materials
 * it would not be, which is why the warehouse screen refuses to.
 *
 * The weighted-average cost covers only lots that carry a cost, and the screen says
 * how many do not. Averaging over the priced lots and presenting it as the cost of
 * all stock would understate the value of everything received without a price.
 */
export default function MaterialDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const { t, tef } = useLanguage();
  const [lots, setLots] = useState<Lot[] | null>(null);
  const [warehouses, setWarehouses] = useState<Record<string, string>>({});

  const loadStock = useCallback(async () => {
    // cost_currency is a reporting currency, not a filter: it converts each lot's
    // cost at the rate nearest its own events, so the figures are comparable
    const [lotRes, whRes] = await Promise.all([
      apiCall<{ inventories: Lot[] }>(
        `/inventory/?page=1&per_page=100&material_uuid=${uuid}&cost_currency=USD`,
      ),
      apiCall<{ warehouses: Array<{ uuid: string; name: string }> }>(
        '/warehouse/?page=1&per_page=100',
      ),
    ]);
    setLots(isOk(lotRes.status) ? (lotRes.data?.inventories ?? []) : []);
    if (isOk(whRes.status)) {
      setWarehouses(
        Object.fromEntries((whRes.data?.warehouses ?? []).map((w) => [w.uuid, w.name])),
      );
    }
  }, [uuid]);

  useEffect(() => {
    loadStock();
  }, [loadStock]);

  const onHand = (lots ?? []).reduce((n, l) => n + Number(l.current_quantity ?? 0), 0);
  const priced = (lots ?? []).filter(
    (l) => l.cost_per_unit != null && Number(l.current_quantity ?? 0) > 0,
  );
  const pricedQty = priced.reduce((n, l) => n + Number(l.current_quantity), 0);
  const weighted =
    pricedQty > 0
      ? priced.reduce((n, l) => n + Number(l.current_quantity) * Number(l.cost_per_unit), 0) /
        pricedQty
      : null;
  const unpricedCount = (lots ?? []).filter(
    (l) => l.cost_per_unit == null && Number(l.current_quantity ?? 0) > 0,
  ).length;
  const qty = (n: number) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));

  return (
    <ModuleDetailScreen<Material>
      module="materials"
      title={t('menu.materials')}
      endpoint={`/material/${uuid}`}
      heading={(x) => x.name}
      rows={(x): DetailRow[] => [
        [t('materials.sku'), x.sku || '—'],
        [t('materials.unit'), x.measure_unit || '—'],
        [t('materials.type'), x.type ? tef(x.type) : '—'],
        [
          t('materials.onHand'),
          lots == null ? '…' : `${qty(onHand)}${x.measure_unit ? ` ${x.measure_unit}` : ''}`,
        ],
        [
          t('materials.avgCost'),
          weighted == null ? '—' : `${weighted.toFixed(2)} USD`,
        ],
        [t('materials.created'), formatNumericDate(new Date(x.created_at))],
      ]}
      sections={[
        {
          title: t('materials.lots'),
          isEmpty: () => !lots?.length,
          emptyText: t('materials.noLots'),
          render: (x) => (
            <>
              {(lots ?? []).map((l) => (
                <View key={l.uuid} style={styles.lot}>
                  <View style={styles.lotLeft}>
                    <ThemedText style={styles.lotWarehouse} numberOfLines={1}>
                      {(l.warehouse_uuid && warehouses[l.warehouse_uuid]) ||
                        t('materials.unknownWarehouse')}
                    </ThemedText>
                    <ThemedText style={styles.lotMeta} numberOfLines={1}>
                      {l.lot_id}
                      {l.cost_per_unit != null
                        ? ` · ${Number(l.cost_per_unit).toFixed(2)} ${l.cost_currency ?? ''}/${
                            l.unit ?? x.measure_unit ?? ''
                          }`
                        : ` · ${t('materials.noCost')}`}
                    </ThemedText>
                  </View>
                  <ThemedText
                    style={[
                      styles.lotQty,
                      Number(l.current_quantity) <= 0 && styles.lotQtyBad,
                    ]}
                  >
                    {qty(Number(l.current_quantity))}
                    {l.unit ? ` ${l.unit}` : ''}
                  </ThemedText>
                </View>
              ))}
              {unpricedCount > 0 && (
                <ThemedText style={styles.note}>
                  {t('materials.unpricedNote', { count: unpricedCount })}
                </ThemedText>
              )}
            </>
          ),
        },
      ]}
      actions={[
        {
          label: t('detail.edit'),
          testID: 'material-edit',
          onPress: (x) =>
            router.push({
              pathname: '/materials/create',
              params: {
                uuid: x.uuid,
                name: x.name ?? '',
                sku: x.sku ?? '',
                type: x.type ?? '',
                measure_unit: x.measure_unit ?? '',
                description: x.description ?? '',
              },
            }),
        },
      ]}
      footer={(x) =>
        x.description ? (
          <View style={styles.descBlock}>
            <ThemedText style={styles.descTitle}>{t('materials.description')}</ThemedText>
            <ThemedText style={styles.desc}>{x.description}</ThemedText>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  lot: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  lotLeft: { flex: 1 },
  lotWarehouse: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  lotMeta: { fontSize: 11, opacity: 0.55, marginTop: 1 },
  lotQty: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  lotQtyBad: { color: '#991b1b' },
  note: { fontSize: 11, opacity: 0.6, marginTop: 8, fontStyle: 'italic' },
  descBlock: { marginTop: 22 },
  descTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  desc: {
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.8,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
});
