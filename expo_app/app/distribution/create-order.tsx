import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { apiCall, apiErrorText, isOk } from '@/utils/api';
import { CUSTOMER_PICKER, PickerField } from '@/components/PickerField';
import { useLanguage } from '@/contexts/LanguageContext';
import { parseAmount, parseWholeNumber } from '@/utils/money';
import { markListsStale } from '@/utils/listRefresh';
import { MONEY_LISTS, ORDER_LISTS, STOCK_LISTS } from '@/utils/orderStatus';

const CURRENCIES = ['SYP', 'USD'];

/**
 * When an unpaid balance falls due. Without one an invoice is never overdue, so
 * the Overdue filter on the orders list could not match an order made in the app.
 * Payment terms here are counted in days, so a few fixed choices beat a calendar.
 */
const DUE_DAYS = [7, 14, 30];

/**
 * The end of the local day `days` from today, as the naive-UTC timestamp the
 * backend's columns hold (the web app sends the same shape).
 */
const dueDateIn = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 0);
  return d.toISOString().slice(0, 19);
};

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

  // Entered from a trip stop (tripStopUuid present) or standalone from the
  // customer-orders list/menu. The two differ in three ways only: standalone shows
  // a customer picker and a notes field, and defaults fulfil/pay OFF — a back-office
  // order is recorded, not handed over; at a stop the goods and cash move right now,
  // so both default ON exactly as before.
  const standalone = !tripStopUuid;

  const [currency, setCurrency] = useState('SYP');
  const [items, setItems] = useState<LineItem[]>([{ material_uuid: '', quantity: '', price_per_unit: '' }]);
  const [customerSel, setCustomerSel] = useState<{ uuid: string; label: string }>({
    uuid: customerUuid ?? '',
    label: customerName ?? '',
  });
  const [notes, setNotes] = useState('');
  const [markFulfilled, setMarkFulfilled] = useState(!standalone);
  const [markPaid, setMarkPaid] = useState(!standalone);
  const [dueDays, setDueDays] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // state lands a render late; a double tap inside that render sent two orders
  const submittingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [materialQuery, setMaterialQuery] = useState('');

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

  // the picker's own search: a catalogue of a few hundred is not scrollable by eye
  const shownMaterials = useMemo(() => {
    const q = materialQuery.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) => m.name.toLowerCase().includes(q) || (m.sku ?? '').toLowerCase().includes(q),
    );
  }, [materials, materialQuery]);

  const materialOf = (uuid: string) => allMaterials.find((m) => m.uuid === uuid);
  const unitOf = (uuid: string) => materialOf(uuid)?.measure_unit || '';

  // Read the way the request is built, so the Total is what gets saved: it used
  // to add up "1.5" as 1.5 while the body sent parseInt's 1.
  const lineQuantity = (it: LineItem) => parseWholeNumber(it.quantity);
  const linePrice = (it: LineItem) => parseAmount(it.price_per_unit);
  const total = items.reduce(
    (sum, it) => sum + (lineQuantity(it) ?? 0) * (linePrice(it) ?? 0),
    0
  );

  const setItem = (i: number, patch: Partial<LineItem>) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, { material_uuid: '', quantity: '', price_per_unit: '' }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const isComplete = (it: LineItem) =>
    !!it.material_uuid && lineQuantity(it) != null && linePrice(it) != null;
  const isStarted = (it: LineItem) =>
    !!it.material_uuid || it.quantity.trim() !== '' || it.price_per_unit.trim() !== '';
  const validItems = items.filter(isComplete);
  // A line started but not valid blocks Submit, and says why. It used to be
  // left off the order without a word — at a stop, with fulfil and pay on,
  // goods handed over with no sale recorded for them.
  const badQuantity = items.find((it) => it.quantity.trim() !== '' && lineQuantity(it) == null);
  const badPrice = items.find((it) => it.price_per_unit.trim() !== '' && linePrice(it) == null);
  const incomplete = items.find((it) => isStarted(it) && !isComplete(it));
  const canSubmit = validItems.length > 0 && !submitting && !!customerSel.uuid && !incomplete;
  // why Submit is greyed out, under it — it used to grey out and say nothing
  const submitHint = !customerSel.uuid
    ? t('createorder.hintCustomer')
    : badQuantity
      ? t('createorder.quantityWhole', { value: badQuantity.quantity.trim() })
      : badPrice
        ? t('customerOrders.priceInvalid')
        : incomplete
          ? t('createorder.hintIncomplete')
          : !validItems.length
            ? t('createorder.hintItems')
            : '';

  const submit = async () => {
    if (!canSubmit || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const body: any = {
        customer_uuid: customerSel.uuid,
        currency,
        trip_stop_uuid: tripStopUuid || null,
        items: validItems.map((it) => ({
          material_uuid: it.material_uuid,
          quantity: lineQuantity(it),
          price_per_unit: linePrice(it),
        })),
        fulfill: markFulfilled,
        pay: markPaid,
      };
      if (markPaid) {
        body.financial_account_uuid = null; // default account by currency
        body.payment_method = 'cash';
      }
      // checkout accepts and persists notes and due_date (verified live)
      if (standalone && notes.trim()) body.notes = notes.trim();
      if (!markPaid && dueDays != null) body.due_date = dueDateIn(dueDays);
      const res = await apiCall<any>('/customer-order/with-items-and-invoice/checkout', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!isOk(res.status)) {
        // the server's reason ("Insufficient inventory for …"), not its JSON
        throw new Error(apiErrorText(res.error, t('createorder.createFailed')));
      }
      markListsStale(
        ...ORDER_LISTS,
        ...(markPaid ? MONEY_LISTS : []),
        ...(markFulfilled ? STOCK_LISTS : []),
      );
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
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeHeader
        title={t('createorder.title')}
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace(standalone ? '/customer-orders' : '/distribution')
        }
      />

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#5469D4" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {standalone ? (
            <View style={styles.customerPick}>
              <ThemedText style={styles.sectionLabel}>{t('createorder.selectCustomer')}</ThemedText>
              <PickerField
                spec={CUSTOMER_PICKER}
                value={customerSel.uuid}
                // the name it arrived with, from a customer's screen or a filtered list
                initialLabel={customerSel.label}
                onChange={(uuid, label) => setCustomerSel({ uuid, label })}
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
                  keyboardType="number-pad"
                  placeholder={t('createorder.qtyPlaceholder')}
                  placeholderTextColor="#9ca3af"
                  value={it.quantity}
                  onChangeText={(t) => setItem(i, { quantity: t })}
                  testID={`qty-${i}`}
                />
                {!!unitOf(it.material_uuid) && <ThemedText style={styles.unit}>{te(unitOf(it.material_uuid))}</ThemedText>}
              </View>
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

          {/* only for a balance left owing; a paid order has nothing to fall due */}
          {!markPaid && (
            <View style={styles.dueBlock}>
              <ThemedText style={styles.toggleLabel}>{t('customerOrders.dueDate')}</ThemedText>
              <View style={styles.dueChips}>
                {[null, ...DUE_DAYS].map((days) => (
                  <TouchableOpacity
                    key={String(days)}
                    style={[styles.chip, dueDays === days && styles.chipActive]}
                    onPress={() => setDueDays(days)}
                    testID={`due-${days ?? 'none'}`}
                  >
                    <ThemedText style={[styles.chipText, dueDays === days && styles.chipTextActive]}>
                      {days == null
                        ? t('customerOrders.dueNone')
                        : t('customerOrders.dueInDays', { days })}
                    </ThemedText>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.submit, !canSubmit && styles.submitDisabled]}
            onPress={submit}
            disabled={!canSubmit}
            testID="button-submit-order"
          >
            {submitting ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.submitText}>{t('createorder.submitOrder')}</ThemedText>}
          </TouchableOpacity>
          {!submitting && !!submitHint && (
            <ThemedText style={styles.submitHint} testID="create-order-hint">
              {submitHint}
            </ThemedText>
          )}
        </ScrollView>
      )}

      {/* material picker modal */}
      <Modal
        visible={pickerRow !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerRow(null)}
        onShow={() => setMaterialQuery('')}
      >
        {/* 'padding' on Android too: edge-to-edge Modals do not resize for the keyboard */}
        <KeyboardAvoidingView style={styles.modalOverlay} behavior="padding">
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>{t('createorder.selectMaterial')}</ThemedText>
              <TouchableOpacity onPress={() => setPickerRow(null)}><ThemedText style={styles.modalClose}>✕</ThemedText></TouchableOpacity>
            </View>
            <TextInput
              style={styles.modalSearch}
              value={materialQuery}
              onChangeText={setMaterialQuery}
              placeholder={t('createorder.searchMaterials')}
              placeholderTextColor="#9ca3af"
              autoCorrect={false}
              testID="material-search"
            />
            <ScrollView style={styles.modalList} keyboardShouldPersistTaps="handled">
              {materials.length === 0 ? (
                <ThemedText style={styles.modalEmpty}>
                  {/* "on the truck" only means something at a trip stop */}
                  {standalone ? t('createorder.noMaterialsCatalogue') : t('createorder.noMaterials')}
                </ThemedText>
              ) : shownMaterials.length === 0 ? (
                <ThemedText style={styles.modalEmpty}>{t('moduleList.noMatches')}</ThemedText>
              ) : (
                shownMaterials.map((m) => (
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
        </KeyboardAvoidingView>
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
  submitHint: { fontSize: 13, lineHeight: 18, opacity: 0.65, textAlign: 'center', marginTop: 8 },
  // wraps: four chips are wider than a phone, and wider again in Arabic
  dueChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dueBlock: {
    paddingVertical: 12, gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(0,0,0,0.1)',
  },
  modalSearch: {
    marginHorizontal: 12, marginTop: 10, marginBottom: 4,
    backgroundColor: '#f3f4f6', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: '#1f2937',
  },
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
