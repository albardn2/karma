import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { useLanguage } from '@/contexts/LanguageContext';

const CURRENCIES = ['USD', 'SYP'];

interface Material {
  uuid: string;
  name: string;
  sku?: string | null;
  measure_unit?: string | null;
}

interface LineItem {
  material_uuid: string;
  quantity: string;
  price_per_unit: string;
}

export default function CreateOrderScreen() {
  const router = useRouter();
  const { t, te } = useLanguage();
  const { tripStopUuid, customerUuid, customerName } = useLocalSearchParams<{
    tripStopUuid?: string;
    customerUuid?: string;
    customerName?: string;
  }>();

  const [currency, setCurrency] = useState('USD');
  const [items, setItems] = useState<LineItem[]>([{ material_uuid: '', quantity: '', price_per_unit: '' }]);
  const [markFulfilled, setMarkFulfilled] = useState(true);
  const [markPaid, setMarkPaid] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [allMaterials, setAllMaterials] = useState<Material[]>([]);
  const [loadedUuids, setLoadedUuids] = useState<string[]>([]);
  const [pickerRow, setPickerRow] = useState<number | null>(null);

  // load materials + the trip's start inventory (to offer only what's on the truck)
  useEffect(() => {
    (async () => {
      const mats = await apiCall<{ materials: Material[] }>('/material/?page=1&per_page=100');
      setAllMaterials(mats.data?.materials || []);

      if (tripStopUuid) {
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

  // only materials that were on the truck at trip start; fall back to all if no snapshot
  const materials = useMemo(
    () => (loadedUuids.length > 0 ? allMaterials.filter((m) => loadedUuids.includes(m.uuid)) : allMaterials),
    [allMaterials, loadedUuids]
  );

  const materialOf = (uuid: string) => allMaterials.find((m) => m.uuid === uuid);
  const unitOf = (uuid: string) => materialOf(uuid)?.measure_unit || '';

  const total = items.reduce(
    (sum, it) => sum + (parseFloat(it.quantity) || 0) * (parseFloat(it.price_per_unit) || 0),
    0
  );

  const setItem = (i: number, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, { material_uuid: '', quantity: '', price_per_unit: '' }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const validItems = items.filter((it) => it.material_uuid && parseInt(it.quantity, 10) > 0 && it.price_per_unit !== '');
  const canSubmit = validItems.length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit || !customerUuid) return;
    setSubmitting(true);
    try {
      const body: any = {
        customer_uuid: customerUuid,
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
      const res = await apiCall('/customer-order/with-items-and-invoice/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (res.status !== 201 && res.status !== 200) {
        throw new Error(res.error || t('createorder.createFailed'));
      }
      router.back();
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
          {customerName ? <ThemedText style={styles.customer}>{customerName}</ThemedText> : null}

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
            <View key={i} style={styles.itemRow}>
              <TouchableOpacity
                style={styles.materialSelect}
                onPress={() => setPickerRow(i)}
                testID={`select-material-${i}`}
              >
                <ThemedText style={[styles.materialSelectText, !it.material_uuid && styles.placeholder]} numberOfLines={1}>
                  {it.material_uuid ? materialOf(it.material_uuid)?.name || t('createorder.material') : t('createorder.selectMaterialPlaceholder')}
                </ThemedText>
              </TouchableOpacity>
              <View style={styles.qtyWrap}>
                <TextInput
                  style={styles.smallInput}
                  keyboardType="numeric"
                  placeholder={t('createorder.qtyPlaceholder')}
                  placeholderTextColor="#9ca3af"
                  value={it.quantity}
                  onChangeText={(t) => setItem(i, { quantity: t })}
                  testID={`qty-${i}`}
                />
                {!!unitOf(it.material_uuid) && <ThemedText style={styles.unit}>{unitOf(it.material_uuid)}</ThemedText>}
              </View>
              <TextInput
                style={[styles.smallInput, styles.priceInput]}
                keyboardType="numeric"
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
          ))}
          <TouchableOpacity style={styles.addItem} onPress={addItem} testID="add-item">
            <ThemedText style={styles.addItemText}>{t('createorder.addItem')}</ThemedText>
          </TouchableOpacity>

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

      {/* material picker modal */}
      <Modal visible={pickerRow !== null} transparent animationType="slide" onRequestClose={() => setPickerRow(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>{t('createorder.selectMaterial')}</ThemedText>
              <TouchableOpacity onPress={() => setPickerRow(null)}><ThemedText style={styles.modalClose}>✕</ThemedText></TouchableOpacity>
            </View>
            <ScrollView style={styles.modalList}>
              {materials.length === 0 ? (
                <ThemedText style={styles.modalEmpty}>{t('createorder.noMaterials')}</ThemedText>
              ) : (
                materials.map((m) => (
                  <TouchableOpacity
                    key={m.uuid}
                    style={styles.modalOption}
                    onPress={() => { if (pickerRow !== null) setItem(pickerRow, { material_uuid: m.uuid }); setPickerRow(null); }}
                    testID={`material-opt-${m.uuid}`}
                  >
                    <ThemedText style={styles.modalOptionText}>
                      {m.name}{m.measure_unit ? ` (${m.measure_unit})` : ''}
                    </ThemedText>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  materialSelect: {
    flex: 1, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#fff', minWidth: 90,
  },
  materialSelectText: { fontSize: 13, color: '#111827' },
  placeholder: { color: '#9ca3af' },
  qtyWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 8, backgroundColor: '#fff', paddingRight: 6 },
  smallInput: { width: 54, paddingHorizontal: 8, paddingVertical: 10, fontSize: 13, color: '#111827' },
  unit: { fontSize: 11, color: '#6b7280' },
  priceInput: { width: 64, borderWidth: 1, borderColor: 'rgba(0,0,0,0.15)', borderRadius: 8, backgroundColor: '#fff' },
  removeBtn: { padding: 6 },
  removeText: { fontSize: 16, color: '#dc2626' },
  removeDisabled: { color: '#d1d5db' },
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
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%', paddingBottom: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.1)' },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalClose: { fontSize: 18, color: '#6b7280' },
  modalList: { paddingHorizontal: 8 },
  modalEmpty: { padding: 16, opacity: 0.6 },
  modalOption: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)' },
  modalOptionText: { fontSize: 15, color: '#111827' },
});
