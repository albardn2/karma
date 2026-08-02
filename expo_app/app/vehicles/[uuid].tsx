import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { ChartLegend, LineChart } from '@/components/Chart';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';

interface Vehicle {
  uuid: string;
  plate_number: string;
  status?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  vin?: string | null;
  notes?: string | null;
}

/** A material line carried on this vehicle. `current_quantity` is derived, not stored. */
interface VehicleLot {
  uuid: string;
  material_uuid: string;
  material_name?: string | null;
  unit?: string | null;
  current_quantity?: number | null;
  is_active?: boolean | null;
}

interface LotEvent {
  uuid: string;
  vehicle_inventory_uuid: string;
  event_type?: string | null;
  /** signed: a sale is negative, a load is positive */
  quantity?: number | null;
  created_at: string;
}

const RANGES = [
  { id: '30d', days: 30 },
  { id: '90d', days: 90 },
  { id: '12m', days: 365 },
] as const;

/** Naive ISO — the backend rejects a zone suffix outright with "Invalid date". */
const naiveIso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, '').replace(/Z$/, '');

const tick = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}/${d.getDate()}`;
};

const qty = (n: number) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));

/** Chart at most this many material lines — a phone-width chart of twenty is a smear. */
const MAX_SERIES = 4;

/**
 * The list DTOs declare per_page as Field(20, gt=0, le=100), so 100 is the ceiling
 * and anything above it 422s the whole request rather than being clamped.
 */
const PER_PAGE = 100;

/**
 * A vehicle, what is loaded on it, and how that changed.
 *
 * There is no vehicle analytics endpoint, and the web app has no vehicle analytics
 * tab either — so this screen is the whole story rather than a tab pointing at a
 * server aggregate. Nothing else in the schema references a vehicle: expenses have
 * no vehicle_uuid, so cost-per-vehicle is not derivable and is deliberately absent
 * rather than approximated.
 *
 * VehicleInventory.current_quantity is NOT a column. It is the sum of that lot's
 * signed events, which is what makes the chart possible: a sale is stored negative
 * and a load positive, so the level is a running total and no event-type table is
 * needed to know which way each one moves. Verified against the database: for all
 * nine lots, the API's current_quantity equals SUM(event.quantity) exactly.
 *
 * The level at the start of the window is therefore `current_quantity` minus the
 * events inside it, which is why the window has no end date — walking back from a
 * known present is cheaper and more accurate than trying to reconstruct a baseline
 * the API does not offer.
 *
 * Stock can be legitimately negative here (this data has a lot at -102 kg), so the
 * chart keeps its zero line and the table flags it rather than clamping.
 */
export default function VehiclesDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t, tef } = useLanguage();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const [reloadKey, setReloadKey] = useState(0);
  const [lots, setLots] = useState<VehicleLot[] | null>(null);
  const [charted, setCharted] = useState<
    Array<{ name: string; points: Array<{ label: string; value: number }> }>
  >([]);
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('90d');
  // a sub-fetch that FAILED must not read as a sub-fetch that returned nothing:
  // during development a per_page over the DTO's cap of 100 gave a 422, which the
  // empty-state fallback rendered as "no movements" and very nearly shipped
  const [stockFailed, setStockFailed] = useState(false);
  const [movesFailed, setMovesFailed] = useState(false);

  const loadStock = useCallback(async () => {
    const res = await apiCall<{ vehicle_inventories: VehicleLot[] }>(
      `/vehicle-inventory/?vehicle_uuid=${uuid}&per_page=${PER_PAGE}`,
    );
    // a failed sub-fetch shows an empty section rather than failing the whole record
    setStockFailed(!isOk(res.status));
    setLots(isOk(res.status) ? (res.data?.vehicle_inventories ?? []) : []);
  }, [uuid]);

  useEffect(() => {
    loadStock();
  }, [loadStock, reloadKey]);

  const loadMovements = useCallback(async () => {
    setMovesFailed(false);
    if (!lots?.length) return setCharted([]);
    const preset = RANGES.find((r) => r.id === range)!;
    const from = new Date();
    from.setDate(from.getDate() - preset.days);

    // Biggest lines only, so this is at most MAX_SERIES requests however long the
    // van's manifest is. There is no vehicle_uuid filter on the event endpoint, so
    // the alternative is fetching every vehicle's events and discarding most.
    const top = lots
      .slice()
      .sort(
        (a, b) => Math.abs(Number(b.current_quantity ?? 0)) - Math.abs(Number(a.current_quantity ?? 0)),
      )
      .slice(0, MAX_SERIES);

    const results = await Promise.all(
      top.map((lot) =>
        apiCall<{ events: LotEvent[] }>(
          `/vehicle-inventory-event/?vehicle_inventory_uuid=${lot.uuid}` +
            `&start_date=${encodeURIComponent(naiveIso(from))}&per_page=${PER_PAGE}`,
        ).then((res) => {
          if (!isOk(res.status)) return { lot, events: [], ok: false };
          return { lot, events: res.data?.events ?? [], ok: true };
        }),
      ),
    );
    // if every series failed, say so; a partial failure still draws what it has
    if (results.length && results.every((r) => !r.ok)) setMovesFailed(true);

    setCharted(
      results
        .map(({ lot, events }) => {
          const ordered = events
            .slice()
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          const windowDelta = ordered.reduce((s, e) => s + Number(e.quantity ?? 0), 0);
          // walk back from the present to get the level as the window opened
          let level = Number(lot.current_quantity ?? 0) - windowDelta;
          return {
            name: `${lot.material_name ?? '—'}${lot.unit ? ` (${lot.unit})` : ''}`,
            points: ordered.map((e) => {
              level += Number(e.quantity ?? 0);
              return { label: tick(e.created_at), value: level };
            }),
          };
        })
        .filter((s) => s.points.length),
    );
  }, [lots, range]);

  useEffect(() => {
    loadMovements();
  }, [loadMovements]);

  return (
    <ModuleDetailScreen<Vehicle>
      module="vehicles"
      title={t('menu.vehicles')}
      endpoint={`/vehicle/${uuid}`}
      reloadKey={reloadKey}
      heading={(x) => x.plate_number}
      rows={(x): DetailRow[] => [
        [t('vehicles.status'), x.status ? tef(x.status) : '—'],
        [t('vehicles.make'), x.make || '—'],
        [t('vehicles.model'), x.model || '—'],
        [t('vehicles.year'), x.year != null ? String(x.year) : '—'],
        [t('vehicles.color'), x.color || '—'],
        [t('vehicles.vin'), x.vin || '—'],
      ]}
      sections={[
        {
          title: t('vehicles.onBoard'),
          isEmpty: () => !lots?.length,
          emptyText: stockFailed ? t('moduleList.failed') : t('vehicles.noStock'),
          render: () => (
            <>
              {(lots ?? []).map((l) => (
                <View key={l.uuid} style={styles.stockRow}>
                  <View style={styles.stockLeft}>
                    <ThemedText style={styles.stockName} numberOfLines={1}>
                      {l.material_name ?? '—'}
                    </ThemedText>
                    {l.is_active === false && (
                      <ThemedText style={styles.stockMeta}>{t('inventory.inactive')}</ThemedText>
                    )}
                  </View>
                  <ThemedText
                    style={[
                      styles.stockQty,
                      Number(l.current_quantity ?? 0) <= 0 && styles.stockQtyBad,
                    ]}
                  >
                    {qty(Number(l.current_quantity ?? 0))}
                    {l.unit ? ` ${l.unit}` : ''}
                  </ThemedText>
                </View>
              ))}
            </>
          ),
        },
        {
          title: t('vehicles.movements'),
          isEmpty: () => !charted.length,
          emptyText: movesFailed ? t('moduleList.failed') : t('vehicles.noMovements'),
          render: () => (
            <>
              <View style={styles.chips}>
                {RANGES.map((r) => (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.chip, range === r.id && styles.chipOn]}
                    onPress={() => setRange(r.id)}
                    testID={`veh-range-${r.id}`}
                  >
                    <ThemedText style={[styles.chipText, range === r.id && styles.chipTextOn]}>
                      {t(`expenses.range.${r.id}`)}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
              <LineChart series={charted} width={width - 72} step />
              <ChartLegend names={charted.map((c) => c.name)} />
              {(lots ?? []).length > charted.length && (
                <ThemedText style={styles.more}>
                  {t('warehouses.topMaterials', { shown: charted.length })}
                </ThemedText>
              )}
            </>
          ),
        },
      ]}
      actions={[
        {
          label: t('detail.edit'),
          testID: 'vehicle-edit',
          onPress: (x) => {
            // bump on return so the record reflects the edit without a manual pull
            setReloadKey((k) => k + 1);
            router.push({
              pathname: '/vehicles/create',
              params: {
                uuid: x.uuid,
                plate_number: x.plate_number ?? '',
                make: x.make ?? '',
                model: x.model ?? '',
                year: x.year != null ? String(x.year) : '',
                color: x.color ?? '',
                status: x.status ?? '',
                vin: x.vin ?? '',
                notes: x.notes ?? '',
              },
            });
          },
        },
      ]}
      footer={(x) =>
        x.notes ? (
          <View style={styles.notes}>
            <ThemedText style={styles.notesText}>{x.notes}</ThemedText>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  stockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  stockLeft: { flex: 1 },
  stockName: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  stockMeta: { fontSize: 11, opacity: 0.55, marginTop: 1 },
  stockQty: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  stockQtyBad: { color: '#991b1b' },
  chips: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: '#f3f4f6' },
  chipOn: { backgroundColor: '#5469D4' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  chipTextOn: { color: '#fff' },
  more: { fontSize: 11, opacity: 0.5, marginTop: 8 },
  notes: { marginTop: 18 },
  notesText: { fontSize: 13, opacity: 0.7, lineHeight: 19 },
});
