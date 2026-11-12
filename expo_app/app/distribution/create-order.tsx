import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { NativeHeader } from '@/components/layout/NativeHeader';
import { apiCall } from '@/utils/api';
import { PickerField } from '@/components/PickerField';
import { useLanguage } from '@/contexts/LanguageContext';

const CURRENCIES = ['SYP', 'USD'];

interface Material {
  uuid: string;
  name: string;
  sku?: string | null;
  measure_unit?: string | null;
}

interface LineItem {
  material_uuid: string;
  /** kept from the picked row: a searched material may lie outside the loaded page */
  material_name: string;
  measure_unit: string;
  quantity: string;
  price_per_unit: string;
}

const EMPTY_ITEM: LineItem = {
  material_uuid: '',
  material_name: '',
  measure_unit: '',
  quantity: '',
  price_per_unit: '',
};

export default function CreateOrderScreen() {
  const router = useRouter();
  const { t, te } = useLanguage();
  const { tripStopUuid, customerUuid, customerName } = useLocalSearchParams<{
    tripStopUuid?: string;
    customerUuid?: string;
    customerName?: string;
  }>();

  // Entered from a trip stop (tripStopUuid present) or standalone from the
  // customer-orders list/menu. The two differ in three ways only: standalone shows
  // a customer picker and a notes field, and defaults fulfil/pay OFF — a back-office
  // order is recorded, not handed over; at a stop the goods and cash move right now,
  // so both default ON exactly as before.
  const standalone = !tripStopUuid;

  const [currency, setCurrency] = useState('SYP');
  const [items, setItems] = useState<LineItem[]>([EMPTY_ITEM]);
  const [customerSel, setCustomerSel] = useState<{ uuid: string; label: string }>({
    uuid: customerUuid ?? '',
    label: customerName ?? '',
  });
  const [notes, setNotes] = useState('');
  const [markFulfilled, setMarkFulfilled] = useState(!standalone);
  const [markPaid, setMarkPaid] = useState(!standalone);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [loadedUuids, setLoadedUuids] = useState<string[]>([]);

  // load materials + the trip's start inventory (to offer only what's on the truck)
  useEffect(() => {
    (async () => {
      if (tripStopUuid) {
        const mats = await apiCall<{ materials: Material[] }>('/material/?page=1&per_page=100');
        setAllMaterials(mats.data?.materials || []);
        const stop = await apiCall<any>(`/trip-stop/${tripStopUuid}`);
        const tripUuid = stop.data?.trip_uuid;
        if (tripUuid) {
          const trip = await apiCall<any>(`/trip/${tripUuid}`);
          const inv: Record<string, number> = trip.data?.start_inventory || {};
          setLoadedUuids(Object.entries(inv).filter(([, q]) => Number(q) > 0).map(([u]) => u));
        }
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // only materials that were on the truck at trip start
  const truckMaterials = useMemo(
    () => allMaterials.filter((m) => loadedUuids.includes(m.uuid)),
    [allMaterials, loadedUuids]
  );

  // On a trip stop the choice is the truck's load, already in hand; otherwise the
  // whole catalogue, searched server-side so materials past the first page are reachable.
  const materialSpec = useMemo(
    () => ({
      endpoint: '/material/',
      itemsKey: 'materials',
      searchParam: 'name',
      params: { per_page: '100' },
      rows: truckMaterials.length > 0 ? truckMaterials : undefined,
      label: (m: Material) => m.name ?? '—',
      // the unit stays out of the label: "name (unit)" in one string flips under bidi
      sublabel: (m: Material) => [m.sku, m.measure_unit].filter(Boolean).join(' · ') || undefined,
      value: (m: Material) => m.uuid,
    }),
    [truckMaterials],
  );

  const total = items.reduce(
    (sum, it) => sum + (parseFloat(it.quantity) || 0) * (parseFloat(it.price_per_unit) || 0),
    0
  );

  const setItem = (i: number, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, EMPTY_ITEM]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const validItems = items.filter((it) => it.material_uuid && parseInt(it.quantity, 10) > 0 && it.price_per_unit !== '');
  const canSubmit = validItems.length > 0 && !submitting && !!customerSel.uuid;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const body: any = {
        customer_uuid: customerSel.uuid,
        currency,
        trip_stop_uuid: tripStopUuid || null,
        items: validItems.map((it) => ({
          material_uuid: it.material_uuid,
          quantity: parseInt(it.quantity, 10),
          price_per_unit: parseFloat(it.price_per_unit),
        })),
        fulfill: markFulfilled,
        pay: markPaid,
      };
      if (markPaid) {
        body.financial_account_uuid = null; // default account by currency
        body.payment_method = 'cash';
      }
      // checkout accepts and persists notes (verified live); due_date it silently
      // drops, which is why there is no due-date field to mislead anyone
      if (standalone && notes.trim()) body.notes = notes.trim();
      const res = await apiCall<any>('/customer-order/with-items-and-invoice/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.status !== 201 && res.status !== 200) {
        throw new Error(res.error || t('createorder.createFailed'));
      }
      if (standalone) {
        // land on the order just made — but via a fresh GET, never this response:
        // checkout's 201 body reports stale derived fields (is_paid false while the
        // payment row already exists), and the detail screen refetches
        const created = res.data?.customer_order?.uuid;
        if (created) router.replace(`/customer-orders/${created}`);
        else router.back();
      } else {
        router.back();
      }
    } catch (e: any) {
      Alert.alert(t('createorder.errorTitle'), e?.message || t('createorder.createError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeHeader
        title={t('createorder.title')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))}
      />

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#5469D4" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {standalone ? (
            <View style={styles.customerPick}>
              <ThemedText style={styles.sectionLabel}>{t('createorder.selectCustomer')}</ThemedText>
              <PickerField
                spec={{
                  endpoint: '/customer/',
                  itemsKey: 'customers',
                  searchParam: 'company_name',
                  label: (c) => c.company_name || c.full_name || c.uuid,
                  sublabel: (c) => (c.company_name ? c.full_name || undefined : undefined),
                  value: (c) => c.uuid,
                }}
                value={customerSel.uuid}
                onChange={(uuid, label) => setCustomerSel({ uuid, label })}
                initialLabel={customerSel.label || undefined}
                testID="create-order-customer"
              />
            </View>
          ) : customerName ? (
            <ThemedText style={styles.customer}>{customerName}</ThemedText>
          ) : null}

          {/* currency + total */}
          <View style={styles.currencyRow}>
            <View style={styles.chipWrap}>
              {CURRENCIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, currency === c && styles.chipActive]}
                  onPress={() => setCurrency(c)}
                  testID={`currency-${c}`}
                >
                  <ThemedText style={[styles.chipText, currency === c && styles.chipTextActive]}>{te(c)}</ThemedText>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.totalWrap}>
              <ThemedText style={styles.totalLabel}>{t('createorder.total')}</ThemedText>
              <ThemedText style={styles.totalValue}>{total.toFixed(2)} {te(currency)}</ThemedText>
            </View>
          </View>

          {/* line items */}
          <ThemedText style={styles.sectionLabel}>{t('createorder.items')}</ThemedText>
          {items.map((it, i) => (
            <View key={i} style={styles.itemCard}>
              <PickerField
                spec={materialSpec}
                value={it.material_uuid}
                onChange={(uuid, label, m: Material) =>
                  setItem(i, { material_uuid: uuid, material_name: label, measure_unit: m?.measure_unit || '' })
                }
                initialLabel={it.material_name || undefined}
                testID={`select-material-${i}`}
              />
              <View style={styles.itemRow}>
                <TextInput
                  style={[styles.smallInput, styles.qtyInput]}
                  keyboardType="number-pad"
                  placeholder={t('createorder.qtyPlaceholder')}
                  placeholderTextColor="#9ca3af"
                  value={it.quantity}
                  onChangeText={(t) => setItem(i, { quantity: t })}
                  testID={`qty-${i}`}
                />
                {/* a suffix beside the box, so the value keeps the box's full width */}
                {!!it.measure_unit && <ThemedText style={styles.unit}>{te(it.measure_unit)}</ThemedText>}
                <TextInput
                  style={[styles.smallInput, styles.priceInput]}
                  keyboardType="decimal-pad"
                  placeholder={t('createorder.pricePlaceholder')}
                  placeholderTextColor="#9ca3af"
                  value={it.price_per_unit}
                  onChangeText={(t) => setItem(i, { price_per_unit: t })}
                  testID={`price-${i}`}
                />
                <TouchableOpacity onPress={() => removeItem(i)} disabled={items.length === 1} style={styles.removeBtn}>
                  <ThemedText style={[styles.removeText, items.length === 1 && styles.removeDisabled]}>✕</ThemedText>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          <TouchableOpacity style={styles.addItem} onPress={addItem} testID="add-item">
            <ThemedText style={styles.addItemText}>{t('createorder.addItem')}</ThemedText>
          </TouchableOpacity>

          {standalone && (
            <>
              <ThemedText style={styles.sectionLabel}>{t('customerOrders.notes')}</ThemedText>
              <TextInput
                style={styles.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder={t('customerOrders.notesPlaceholder')}
                placeholderTextColor="#9ca3af"
                multiline
                testID="create-order-notes"
              />
            </>
          )}

          {/* toggles */}
          <View style={styles.toggleRow}>
            <ThemedText style={styles.toggleLabel}>{t('createorder.markFulfilled')}</ThemedText>
            <Switch value={markFulfilled} onValueChange={setMarkFulfilled} trackColor={{ true: '#5469D4' }} testID="toggle-fulfilled" />
          </View>
          <View style={styles.toggleRow}>
            <ThemedText style={styles.toggleLabel}>{t('createorder.markPaid')}</ThemedText>
            <Switch value={markPaid} onValueChange={setMarkPaid} trackColor={{ true: '#5469D4' }} testID="toggle-paid" />
          </View>

          <TouchableOpacity
            style={[styles.submit, !canSubmit && styles.submitDisabled]}
            onPress={submit}
            disabled={!canSubmit}
            testID="button-submit-order"
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.submitText}>{t('createorder.submitOrder')}</ThemedText>}
          </TouchableOpacity>
        </ScrollView>
      )}

    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, paddingBottom: 40 },
  customer: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  currencyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  chipWrap: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(0,0,0,0.12)' },
  chipActive: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  chipText: { fontSize: 14, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  totalWrap: { alignItems: 'flex-end' },
  totalLabel: { fontSize: 12, opacity: 0.6 },
  totalValue: { fontSize: 18, fontWeight: '700' },
  sectionLabel: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  itemCard: {
    gap: 8, marginBottom: 10, padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)', backgroundColor: '#fafafa',
  },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallInput: {
    paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: '#111827',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 8, backgroundColor: '#fff',
  },
  qtyInput: { flex: 1 },
  unit: { fontSize: 11, color: '#6b7280' },
  priceInput: { flex: 1 },
  removeBtn: { padding: 6 },
  removeText: { fontSize: 16, color: '#dc2626' },
  removeDisabled: { color: '#d1d5db' },
  customerPick: { marginBottom: 16 },
  notesInput: {
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 8, backgroundColor: '#fff',
    paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: '#111827',
    minHeight: 70, textAlignVertical: 'top', marginBottom: 12,
  },
  addItem: { paddingVertical: 8 },
  addItemText: { color: '#5469D4', fontWeight: '600', fontSize: 14 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.1)',
  },
  toggleLabel: { fontSize: 15 },
  submit: { marginTop: 16, backgroundColor: '#5469D4', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
