import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { PickerField } from '@/components/PickerField';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { money } from '@/utils/money';

const CURRENCIES = ['USD', 'SYP'];

interface Line {
  material_uuid: string;
  material_name: string;
  /** the material's own measure_unit — resolved from the server, never guessed */
  unit: string;
  quantity: string;
  price_per_unit: string;
}

const blank = (): Line => ({
  material_uuid: '',
  material_name: '',
  unit: '',
  quantity: '',
  price_per_unit: '',
});

/**
 * Raise a purchase order with its lines, in one request.
 *
 * Hand-rolled rather than ModuleForm because ModuleForm's field spec cannot express N
 * repeating line items. The structural precedent is distribution/create-order.tsx; the
 * difference is that each line here is a CARD rather than a four-control row, because a
 * purchase line needs a material, a quantity, a unit and a price, and four controls on
 * one 375pt row leaves each of them too small to hit.
 *
 * POST /purchase-order/with-items writes the order and its lines in one transaction.
 * The loose POST /purchase-order/ exists but must not be used from here: it would leave
 * an order with no lines, and see below for why that record is a trap.
 *
 * A ZERO-LINE ORDER IS REFUSED CLIENT-SIDE, and this is the sharpest rule on the
 * screen. The server accepts `purchase_order_items: []` with a 201 and then reports the
 * result as `status: "paid", is_paid: true, is_fulfilled: true` — because is_paid is
 * computed as `net_amount_due == 0` and a total of nothing satisfies it. The guarded
 * delete then refuses it forever with "PurchaseOrder has been paid or partially paid".
 * So an accidental empty submit creates a permanently undeletable order that reports
 * itself as settled. One valid line is the minimum this screen will send.
 *
 * THE UNIT IS NOT THE USER'S TO CHOOSE. It must equal the material's own measure_unit
 * exactly or the write is 400 "Invalid unit: pcs. Expected: kg", so it is resolved from
 * the material after selection and rendered read-only beside the quantity.
 *
 * `quantity_received` IS accepted by this endpoint and is deliberately never sent:
 * it would record a receipt that no inventory event backs, i.e. stock that the books
 * claim arrived and the warehouse never saw.
 *
 * Negative quantities and prices are refused here only. The server has no lower bound
 * — quantity -5 at price -9 is a 201 that ADDS 45 to the order total.
 */
export default function PurchaseOrderCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, tef } = useLanguage();
  const { vendor_uuid, vendor_name } = useLocalSearchParams<{
    vendor_uuid?: string;
    vendor_name?: string;
  }>();

  const [vendor, setVendor] = useState(vendor_uuid ?? '');
  const [currency, setCurrency] = useState('USD');
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [saving, setSaving] = useState(false);

  const setLine = (i: number, patch: Partial<Line>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  /**
   * Resolve the unit from the material itself rather than from the picker row.
   *
   * A targeted GET keeps this correct for a catalogue of any size: seeding the picker
   * from one page of 100 would silently omit material 101, and the unit is the one
   * field where a wrong guess is a hard 400.
   */
  const pickMaterial = useCallback(async (i: number, uuid: string, label: string) => {
    setLine(i, { material_uuid: uuid, material_name: label, unit: '' });
    const res = await apiCall<{ measure_unit?: string | null }>(`/material/${uuid}`);
    if (isOk(res.status)) setLine(i, { unit: res.data?.measure_unit ?? '' });
  }, []);

  const valid = lines.filter(
    (l) =>
      l.material_uuid &&
      Number.isInteger(Number(l.quantity)) &&
      Number(l.quantity) >= 1 &&
      l.price_per_unit.trim() !== '' &&
      Number(l.price_per_unit) >= 0 &&
      !Number.isNaN(Number(l.price_per_unit)),
  );
  const total = valid.reduce(
    (s, l) => s + Number(l.quantity) * Number(l.price_per_unit),
    0,
  );
  const canSubmit = !!vendor && valid.length > 0 && !saving;

  const submit = async () => {
    if (!vendor) return;
    if (!valid.length) {
      Alert.alert(t('purchaseOrders.create'), t('purchaseOrders.needALine'));
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, any> = {
        vendor_uuid: vendor,
        currency,
        purchase_order_items: valid.map((l) => ({
          material_uuid: l.material_uuid,
          quantity: Number(l.quantity),
          price_per_unit: Number(l.price_per_unit),
          // the domain overwrites this with the order's currency, but the field is
          // required — so send the order's, never a second value to be discarded
          currency,
          unit: l.unit,
        })),
      };
      if (notes.trim()) body.notes = notes.trim();
      // naive local midnight: a numeric offset IS honoured on this column and would
      // shift the stored instant, and the app writes dates naive everywhere else
      if (due.trim()) body.payout_due_date = `${due.trim()}T00:00:00`;

      const res = await apiCall<{ uuid?: string }>('/purchase-order/with-items', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (isOk(res.status)) {
        const created = res.data?.uuid;
        // never render this response: create bodies report stale derived fields, so
        // the detail screen refetches instead
        if (created) router.replace(`/purchase-orders/${created}`);
        else router.back();
        return;
      }
      const raw = String(res.error ?? '').slice(0, 300);
      Alert.alert(
        t('form.saveFailed'),
        res.status === 403
          ? t('purchaseOrders.forbidden')
          : res.status === 409
            ? t('purchaseOrders.vendorMissing')
            : // a 400 names the unit mismatch and a 422 names the field — both are
              // more useful than anything this screen could substitute
              raw || t('form.tryAgain'),
      );
    } catch {
      Alert.alert(t('form.saveFailed'), t('form.tryAgain'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModuleGuard module="purchase-orders">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="form-cancel">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('purchaseOrders.create')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.top + 50}
        >
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: 40 + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
          >
            <ThemedText style={styles.note}>{t('purchaseOrders.frozenNote')}</ThemedText>

            <ThemedText style={styles.label}>{t('purchaseOrders.vendor')} *</ThemedText>
            <PickerField
              spec={{
                endpoint: '/vendor/',
                itemsKey: 'vendors',
                searchParam: 'company_name',
                label: (v) => v.company_name || v.full_name || v.uuid,
                sublabel: (v) => (v.company_name ? v.full_name || undefined : undefined),
                value: (v) => v.uuid,
              }}
              value={vendor}
              onChange={(v) => setVendor(v)}
              initialLabel={vendor_name || undefined}
              testID="po-vendor"
            />

            <ThemedText style={[styles.label, styles.spaced]}>
              {t('financialAccounts.currency')} *
            </ThemedText>
            <View style={styles.chips}>
              {CURRENCIES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.chip, currency === c && styles.chipOn]}
                  onPress={() => setCurrency(c)}
                  testID={`po-currency-${c}`}
                >
                  <ThemedText style={[styles.chipText, currency === c && styles.chipTextOn]}>
                    {tef(c)}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.totalBar}>
              <ThemedText style={styles.totalLabel}>{t('purchaseOrders.orderTotal')}</ThemedText>
              <ThemedText style={styles.totalValue} testID="po-total">
                {money(total, currency)}
              </ThemedText>
            </View>

            <ThemedText style={styles.sectionTitle}>{t('purchaseOrders.lines')}</ThemedText>
            <ThemedText style={styles.hint}>{t('purchaseOrders.unitFromMaterial')}</ThemedText>

            {lines.map((l, i) => (
              <View key={i} style={styles.lineCard} testID={`po-line-${i}`}>
                <View style={styles.lineHead}>
                  <ThemedText style={styles.lineIndex}>{i + 1}</ThemedText>
                  <TouchableOpacity
                    onPress={() => setLines((prev) => prev.filter((_, idx) => idx !== i))}
                    disabled={lines.length === 1}
                    hitSlop={10}
                    testID={`po-line-remove-${i}`}
                  >
                    <ThemedText
                      style={[styles.remove, lines.length === 1 && styles.removeOff]}
                    >
                      ✕
                    </ThemedText>
                  </TouchableOpacity>
                </View>

                <PickerField
                  spec={{
                    endpoint: '/material/',
                    itemsKey: 'materials',
                    searchParam: 'name',
                    params: { per_page: '100' },
                    label: (m) => m.name ?? '—',
                    value: (m) => m.uuid,
                    sublabel: (m) =>
                      [m.sku, m.measure_unit].filter(Boolean).join(' · ') || undefined,
                  }}
                  value={l.material_uuid}
                  onChange={(uuid, label) => pickMaterial(i, uuid, label)}
                  testID={`po-line-material-${i}`}
                />

                <View style={styles.lineInputs}>
                  <View style={styles.qtyWrap}>
                    <TextInput
                      style={styles.input}
                      value={l.quantity}
                      onChangeText={(v) => setLine(i, { quantity: v })}
                      placeholder={t('purchaseOrders.quantity')}
                      placeholderTextColor="#9ca3af"
                      keyboardType="numeric"
                      testID={`po-line-qty-${i}`}
                    />
                    {!!l.unit && <ThemedText style={styles.unit}>{tef(l.unit)}</ThemedText>}
                  </View>
                  <TextInput
                    style={[styles.input, styles.priceInput]}
                    value={l.price_per_unit}
                    onChangeText={(v) => setLine(i, { price_per_unit: v })}
                    placeholder={t('purchaseOrders.pricePerUnit')}
                    placeholderTextColor="#9ca3af"
                    keyboardType="numeric"
                    testID={`po-line-price-${i}`}
                  />
                </View>

                {!!l.quantity && !!l.price_per_unit && (
                  <ThemedText style={styles.lineTotal}>
                    {money(Number(l.quantity) * Number(l.price_per_unit), currency)}
                  </ThemedText>
                )}
              </View>
            ))}

            <TouchableOpacity
              style={styles.addLine}
              onPress={() => setLines((prev) => [...prev, blank()])}
              testID="po-add-line"
            >
              <ThemedText style={styles.addLineText}>+ {t('purchaseOrders.addLine')}</ThemedText>
            </TouchableOpacity>

            <ThemedText style={[styles.label, styles.spaced]}>
              {t('purchaseOrders.dueDate')}
            </ThemedText>
            <TextInput
              style={styles.input}
              value={due}
              onChangeText={setDue}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9ca3af"
              autoCorrect={false}
              testID="po-due"
            />

            <ThemedText style={[styles.label, styles.spaced]}>
              {t('purchaseOrders.notes')}
            </ThemedText>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={notes}
              onChangeText={setNotes}
              multiline
              testID="po-notes"
            />

            <TouchableOpacity
              style={[styles.submit, !canSubmit && styles.submitOff]}
              onPress={submit}
              disabled={!canSubmit}
              testID="form-submit"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.submitText}>{t('form.save')}</ThemedText>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedView>
    </ModuleGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 20, paddingTop: 6 },
  note: { fontSize: 13, opacity: 0.7, lineHeight: 19, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, opacity: 0.75 },
  spaced: { marginTop: 16 },
  hint: { fontSize: 12, opacity: 0.55, marginBottom: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipOn: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#4B5563' },
  chipTextOn: { color: '#fff' },
  totalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 16,
  },
  totalLabel: { fontSize: 13, fontWeight: '600', opacity: 0.7 },
  totalValue: { fontSize: 18, fontWeight: '700', color: '#312e81' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginTop: 22, marginBottom: 4 },
  lineCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  lineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lineIndex: { fontSize: 12, fontWeight: '700', opacity: 0.4 },
  remove: { fontSize: 15, color: '#dc2626', fontWeight: '700' },
  removeOff: { opacity: 0.25 },
  lineInputs: { flexDirection: 'row', gap: 8 },
  qtyWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceInput: { flex: 1 },
  unit: { fontSize: 12, fontWeight: '600', opacity: 0.6 },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  lineTotal: { fontSize: 13, fontWeight: '700', textAlign: 'right', color: '#1f2937' },
  addLine: { paddingVertical: 10, alignItems: 'center' },
  addLineText: { fontSize: 14, fontWeight: '700', color: '#5469D4' },
  submit: {
    marginTop: 24,
    backgroundColor: '#5469D4',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitOff: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
