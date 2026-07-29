import React, { useEffect, useRef, useState } from 'react';
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
import { useLanguage } from '@/contexts/LanguageContext';
import { formatMonthDayTime } from '@/utils/date';

// money is DOUBLE PRECISION end to end; never render or send the raw float
const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

export default function OrderActionsScreen() {
  const { t, te } = useLanguage();
  const router = useRouter();
  const { orderUuid, tripStopUuid } = useLocalSearchParams<{ orderUuid?: string; tripStopUuid?: string }>();

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [doFulfill, setDoFulfill] = useState(true);
  const [doPay, setDoPay] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // shown for a beat on success, then the screen pops back to the stop
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const backTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (backTimer.current) clearTimeout(backTimer.current);
  }, []);

  const load = async () => {
    setLoading(true);
    const res = await apiCall<any>(`/customer-order/with-items-and-invoice/${orderUuid}`);
    setData(res.data || null);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderUuid]);

  const order = data?.customer_order;
  const invoice = data?.invoices?.[0];
  const items = (order?.customer_order_items || []).filter((i: any) => !i.is_deleted);
  const unfulfilled = items.filter((i: any) => !i.is_fulfilled);
  const amountDue = invoice?.net_amount_due ?? order?.net_amount_due ?? 0;
  const currency = order?.currency || '';
  const canFulfill = unfulfilled.length > 0;
  const canPay = amountDue > 0;

  // How much of the balance is being collected. Kept as a string so the field
  // can be cleared while typing, and seeded with the whole balance so the common
  // case is unchanged: leave it alone and Submit settles the order. Re-seeded
  // whenever the balance changes, so after one instalment the field offers the
  // NEW remainder rather than the amount already taken.
  const [payAmount, setPayAmount] = useState('');
  useEffect(() => {
    if (canPay) setPayAmount(String(round2(amountDue)));
  }, [amountDue, canPay]);

  const payNumber = Number(payAmount);
  const payAmountValid =
    payAmount.trim() !== '' &&
    Number.isFinite(payNumber) &&
    payNumber > 0 &&
    // half a cent of slack, matching MONEY_TOLERANCE on the backend, so typing
    // the balance back in cannot be refused over a rounding hair
    payNumber <= amountDue + 0.005;
  const remainingAfter = payAmountValid ? round2(amountDue - payNumber) : null;

  const submit = async () => {
    if (!(doFulfill && canFulfill) && !(doPay && canPay && payAmountValid)) return;
    setSubmitting(true);
    try {
      if (doFulfill && canFulfill) {
        const r = await apiCall('/customer-order-item/fulfill-items', {
          method: 'POST',
          body: JSON.stringify({
            items: unfulfilled.map((i: any) => ({ customer_order_item_uuid: i.uuid })),
            trip_stop_uuid: tripStopUuid || null,
          }),
        });
        if (r.status !== 200 && r.status !== 201) throw new Error(r.error || t('order.failedToFulfill'));
      }
      if (doPay && canPay && payAmountValid) {
        const r = await apiCall('/payment/', {
          method: 'POST',
          body: JSON.stringify({
            invoice_uuid: invoice.uuid,
            financial_account_uuid: null,
            // the full balance by default, or less for a part payment. Rounded to
            // the cent so a float tail cannot be read as an overpayment.
            amount: round2(payNumber),
            currency,
            payment_method: 'cash',
            trip_stop_uuid: tripStopUuid || null,
          }),
        });
        if (r.status !== 200 && r.status !== 201) throw new Error(r.error || t('order.failedToRecordPayment'));
      }
      // Confirm what happened, then get out of the way. Whether the payment
      // settled the order or only part of it, the next step is back at the stop —
      // and lingering on a now-stale balance invites paying twice.
      const paid = doPay && canPay && payAmountValid;
      setSavedBanner(
        paid
          ? `${t('order.paymentRecorded')} · ${round2(payNumber)} ${te(currency)}`
          : t('order.orderUpdated')
      );
      backTimer.current = setTimeout(() => {
        if (router.canGoBack()) router.back();
        else router.replace('/distribution');
      }, 1100);
    } catch (e: any) {
      Alert.alert(t('order.error'), e?.message || t('order.couldNotUpdateOrder'));
    } finally {
      setSubmitting(false);
    }
  };

  const nothingSelected =
    !(doFulfill && canFulfill) && !(doPay && canPay && payAmountValid);

  const fmtDate = (s?: string) => {
    if (!s) return '';
    const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + 'Z');
    return isNaN(d.getTime()) ? s : formatMonthDayTime(d);
  };

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <NativeHeader
        title={t('order.title')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/distribution'))}
      />

      {loading || !order ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#5469D4" /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* header */}
          <View style={styles.headerRow}>
            <ThemedText style={styles.date}>{fmtDate(order.created_at)}</ThemedText>
            <View style={styles.badges}>
              <View style={[styles.badge, order.is_paid ? styles.badgeGreen : styles.badgeRed]}>
                <ThemedText style={styles.badgeText}>{order.is_paid ? t('order.paid') : t('order.unpaid')}</ThemedText>
              </View>
              <View style={[styles.badge, order.is_fulfilled ? styles.badgeGreen : styles.badgeGray]}>
                <ThemedText style={styles.badgeText}>{order.is_fulfilled ? t('order.fulfilled') : t('order.unfulfilled')}</ThemedText>
              </View>
            </View>
          </View>

          {/* items */}
          <View style={styles.itemsBox}>
            {items.map((i: any) => (
              <View key={i.uuid} style={styles.itemRow}>
                <ThemedText style={styles.itemName}>{i.material_name} × {i.quantity} {i.unit || ''}</ThemedText>
                <ThemedText style={[styles.itemTag, i.is_fulfilled ? styles.tagGreen : styles.tagGray]}>
                  {i.is_fulfilled ? t('order.itemFulfilled') : t('order.itemPending')}
                </ThemedText>
              </View>
            ))}
          </View>

          {savedBanner && (
            <View style={styles.savedBanner} testID="order-saved-banner">
              <ThemedText style={styles.savedBannerText}>{savedBanner}</ThemedText>
            </View>
          )}

          {/* totals */}
          <View style={styles.totals}>
            <View style={styles.totalLine}><ThemedText style={styles.totalKey}>{t('order.total')}</ThemedText><ThemedText>{round2(invoice?.total_amount ?? order.total_adjusted_amount ?? 0)} {te(currency)}</ThemedText></View>
            <View style={styles.totalLine}><ThemedText style={styles.totalKey}>{t('order.totalPaid')}</ThemedText><ThemedText>{round2(invoice?.net_amount_paid ?? order.net_amount_paid ?? 0)} {te(currency)}</ThemedText></View>
            <View style={styles.totalLine}><ThemedText style={styles.totalKeyBold}>{t('order.due')}</ThemedText><ThemedText style={styles.totalKeyBold} testID="text-amount-due">{round2(amountDue)} {te(currency)}</ThemedText></View>
          </View>

          {/* actions */}
          {(canFulfill || canPay) ? (
            <View style={styles.actions}>
              {canFulfill && (
                <View style={styles.toggleRow}>
                  <ThemedText style={styles.toggleLabel}>{unfulfilled.length > 1 ? t('order.markFulfilledMany', { count: unfulfilled.length }) : t('order.markFulfilledOne', { count: unfulfilled.length })}</ThemedText>
                  <Switch value={doFulfill} onValueChange={setDoFulfill} trackColor={{ true: '#5469D4' }} testID="toggle-fulfill" />
                </View>
              )}
              {canPay && (
                <View style={styles.toggleRow}>
                  <ThemedText style={styles.toggleLabel}>{t('order.recordPayment')}</ThemedText>
                  <Switch value={doPay} onValueChange={setDoPay} trackColor={{ true: '#5469D4' }} testID="toggle-pay" />
                </View>
              )}

              {/* how much of the balance is being taken — prefilled with all of
                  it, so settling the order is still one tap */}
              {canPay && doPay && (
                <View style={styles.payBlock}>
                  <View style={styles.payRow}>
                    <TextInput
                      style={styles.payInput}
                      value={payAmount}
                      onChangeText={setPayAmount}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                      accessibilityLabel={t('order.amountToPay')}
                      testID="input-pay-amount"
                    />
                    <ThemedText style={styles.payCurrency}>{te(currency)}</ThemedText>
                    <TouchableOpacity
                      style={styles.fullBtn}
                      onPress={() => setPayAmount(String(round2(amountDue)))}
                      testID="button-pay-full"
                    >
                      <ThemedText style={styles.fullBtnText}>{t('order.payFullBalance')}</ThemedText>
                    </TouchableOpacity>
                  </View>
                  {!payAmountValid ? (
                    <ThemedText style={styles.payError} testID="text-pay-amount-error">
                      {t('order.payAmountInvalid', { amount: round2(amountDue), currency: te(currency) })}
                    </ThemedText>
                  ) : (
                    <ThemedText style={styles.payHint} testID="text-remaining-after">
                      {remainingAfter === 0
                        ? t('order.settlesOrder')
                        : t('order.remainingAfter', { amount: remainingAfter as number, currency: te(currency) })}
                    </ThemedText>
                  )}
                </View>
              )}
              <TouchableOpacity
                style={[styles.submit, (nothingSelected || submitting) && styles.submitDisabled]}
                onPress={submit}
                disabled={nothingSelected || submitting || !!savedBanner}
                testID="button-submit-order-actions"
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <ThemedText style={styles.submitText}>{t('order.submit')}</ThemedText>}
              </TouchableOpacity>
            </View>
          ) : (
            <ThemedText style={styles.settled}>{t('order.fullySettled')}</ThemedText>
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  date: { fontSize: 13, opacity: 0.6 },
  badges: { flexDirection: 'row', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeGreen: { backgroundColor: '#D1FAE5' },
  badgeRed: { backgroundColor: '#FEE2E2' },
  badgeGray: { backgroundColor: '#E5E7EB' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  itemsBox: { borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)', borderRadius: 10, marginBottom: 16 },
  itemRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  itemName: { fontSize: 14, flex: 1, marginRight: 8 },
  itemTag: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  tagGreen: { backgroundColor: '#D1FAE5', color: '#047857' },
  tagGray: { backgroundColor: '#E5E7EB', color: '#4B5563' },
  // same green as the stop screen's completed banner, so success reads the same
  // way everywhere in the app
  savedBanner: { backgroundColor: '#D1FAE5', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 14 },
  savedBannerText: { color: '#047857', fontSize: 15, fontWeight: '700' },
  totals: { marginBottom: 16 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  totalKey: { opacity: 0.6 },
  totalKeyBold: { fontWeight: '700' },
  actions: { borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)', paddingTop: 12 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  toggleLabel: { fontSize: 15 },
  payBlock: { paddingBottom: 4 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  payInput: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 16,
    minWidth: 120, color: '#111827', backgroundColor: '#fff',
  },
  payCurrency: { fontSize: 14, opacity: 0.6 },
  fullBtn: {
    borderWidth: 1, borderColor: '#5469D4', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
  },
  fullBtnText: { color: '#5469D4', fontSize: 13, fontWeight: '700' },
  payError: { fontSize: 12, color: '#DC2626', paddingTop: 6 },
  payHint: { fontSize: 12, opacity: 0.6, paddingTop: 6 },
  submit: { marginTop: 12, backgroundColor: '#5469D4', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  settled: { textAlign: 'center', opacity: 0.6, paddingVertical: 16 },
});
