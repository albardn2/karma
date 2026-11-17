import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { PickerField } from '@/components/PickerField';
import { KEYBOARD_DONE_BAR_ID, KeyboardDoneBar } from '@/components/KeyboardDoneBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useApiQuery } from '@/hooks/useApiQuery';
import { apiCall, isOk, apiErrorText } from '@/utils/api';
import { plainDate } from '@/utils/date';
import { money } from '@/utils/money';
import { BACK_GLYPH } from '@/utils/rtl';

interface Side {
  uuid: string;
  label: string;
  currency: string;
}

const NONE: Side = { uuid: '', label: '', currency: '' };

/**
 * How far a typed rate may sit from the latest recorded one before the screen asks
 * whether it is meant. Street rates move, so this warns rather than refuses; it is
 * there to catch an old-pound rate (100× too big) or a slipped digit.
 */
const RATE_WARN_FRACTION = 0.1;

/** The API compares amounts at 2 decimals; an unrounded product carries float noise. */
const round2 = (v: number) => Math.round(v * 100) / 100;

const ACCOUNT_SPEC = {
  endpoint: '/financial-account/',
  itemsKey: 'accounts',
  params: { per_page: '100' },
  label: (a: any) => a.account_name || a.uuid,
  sublabel: (a: any) => [a.currency, a.is_external ? 'external' : null].filter(Boolean).join(' · ') || undefined,
  value: (a: any) => a.uuid,
};

/**
 * Move money between financial accounts, or record money coming in or going out.
 *
 * The shapes the API accepts (TransactionDomain.validate_create_payload):
 * - from only: money leaving an account (from_amount, from_currency);
 * - to only: money arriving in an account (to_amount, to_currency);
 * - both: a transfer. In one currency both amounts are equal; across USD and SYP a
 *   USD→SYP rate is required and the amounts must agree with it to the cent.
 *
 * Each side's currency is its account's, so the user never picks one. On a transfer
 * the received amount is derived from the sent amount and the rate rather than typed,
 * because any other value is refused. The rate starts at the latest recorded one.
 */
export default function TransactionCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [from, setFrom] = useState<Side>(NONE);
  const [to, setTo] = useState<Side>(NONE);
  const [amount, setAmount] = useState('');
  const [rate, setRate] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const latest = useApiQuery<{ rate: number; rate_date: string }>(
    '/exchange-rate/latest?from_currency=USD&to_currency=SYP',
  );

  const isTransfer = !!from.uuid && !!to.uuid;
  const needsRate = isTransfer && !!from.currency && !!to.currency && from.currency !== to.currency;
  const amountCurrency = from.uuid ? from.currency : to.currency;

  // seed the rate once it is needed, without overwriting what the user typed
  useEffect(() => {
    if (needsRate && rate === '' && latest.data?.rate) setRate(String(latest.data.rate));
  }, [needsRate, rate, latest.data?.rate]);

  const amt = Number(amount);
  const r = Number(rate);
  const received = (() => {
    if (!isTransfer || !(amt > 0)) return null;
    if (from.currency === to.currency) return round2(amt);
    if (!(r > 0)) return null;
    if (from.currency === 'USD' && to.currency === 'SYP') return round2(amt * r);
    if (from.currency === 'SYP' && to.currency === 'USD') return round2(amt / r);
    return null;
  })();

  const problem = (() => {
    if (!from.uuid && !to.uuid) return t('transactions.needAccount');
    if (from.uuid && from.uuid === to.uuid) return t('transactions.sameAccount');
    if (!(amt > 0)) return t('transactions.needAmount');
    if (needsRate && !(r > 0)) return t('transactions.needRate');
    return null;
  })();

  const latestRate = latest.data?.rate;
  const rateOff =
    needsRate && r > 0 && !!latestRate && Math.abs(r - latestRate) / latestRate > RATE_WARN_FRACTION;

  const submit = () => {
    if (problem) {
      Alert.alert(t('transactions.newTitle'), problem);
      return;
    }
    if (rateOff) {
      Alert.alert(t('transactions.rateOffTitle'), t('transactions.rateOff', { rate: String(r), latest: String(latestRate) }), [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('transactions.recordAnyway'), onPress: send },
      ]);
      return;
    }
    send();
  };

  const send = async () => {
    // only the sides actually used: a from-only transaction that also carries to_*
    // fields is refused, and vice versa
    const body: Record<string, unknown> = {};
    if (notes.trim()) body.notes = notes.trim();
    if (from.uuid) Object.assign(body, { from_account_uuid: from.uuid, from_amount: round2(amt), from_currency: from.currency });
    if (to.uuid) {
      Object.assign(body, {
        to_account_uuid: to.uuid,
        to_amount: isTransfer ? received : round2(amt),
        to_currency: to.currency,
      });
    }
    if (needsRate) body.usd_to_syp_exchange_rate = r;

    setSaving(true);
    try {
      const res = await apiCall('/transaction/', { method: 'POST', body: JSON.stringify(body) });
      if (isOk(res.status)) {
        router.back();
        return;
      }
      Alert.alert(t('form.saveFailed'), apiErrorText(res.error, t('form.tryAgain')));
    } catch {
      Alert.alert(t('form.saveFailed'), t('form.tryAgain'));
    } finally {
      setSaving(false);
    }
  };

  const seeded = needsRate && !!latest.data?.rate && Number(rate) === latest.data.rate;

  return (
    <ModuleGuard module="transactions">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="form-cancel">
            <ThemedText style={styles.back}>{BACK_GLYPH}</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('transactions.newTitle')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? undefined : 'height'}>
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: 40 + insets.bottom }]}
            automaticallyAdjustKeyboardInsets
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
          >
            <KeyboardDoneBar />
            <ThemedText style={styles.note}>{t('transactions.sidesNote')}</ThemedText>

            <ThemedText style={styles.label}>{t('transactions.fromAccount')}</ThemedText>
            <PickerField
              spec={ACCOUNT_SPEC}
              value={from.uuid}
              onChange={(uuid, label, row) => setFrom({ uuid, label, currency: row?.currency ?? '' })}
              testID="tx-from"
            />
            {!!from.uuid && (
              <TouchableOpacity onPress={() => setFrom(NONE)} hitSlop={8}>
                <ThemedText style={styles.clear}>{t('transactions.clearSide')}</ThemedText>
              </TouchableOpacity>
            )}

            <ThemedText style={[styles.label, styles.spaced]}>{t('transactions.toAccount')}</ThemedText>
            <PickerField
              spec={ACCOUNT_SPEC}
              value={to.uuid}
              onChange={(uuid, label, row) => setTo({ uuid, label, currency: row?.currency ?? '' })}
              testID="tx-to"
            />
            {!!to.uuid && (
              <TouchableOpacity onPress={() => setTo(NONE)} hitSlop={8}>
                <ThemedText style={styles.clear}>{t('transactions.clearSide')}</ThemedText>
              </TouchableOpacity>
            )}

            <ThemedText style={[styles.label, styles.spaced]}>
              {amountCurrency ? t('transactions.amountIn', { currency: amountCurrency }) : t('transactions.amountPlain')}
            </ThemedText>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              inputAccessoryViewID={KEYBOARD_DONE_BAR_ID}
              placeholder="0.00"
              testID="tx-amount"
            />

            {needsRate && (
              <>
                <ThemedText style={[styles.label, styles.spaced]}>{t('transactions.rate')}</ThemedText>
                <TextInput
                  style={styles.input}
                  value={rate}
                  onChangeText={setRate}
                  keyboardType="decimal-pad"
                  inputAccessoryViewID={KEYBOARD_DONE_BAR_ID}
                  testID="tx-rate"
                />
                {rateOff && (
                  <ThemedText style={styles.warn} testID="tx-rate-off">
                    {t('transactions.rateOffHint', { latest: String(latestRate) })}
                  </ThemedText>
                )}
                {seeded && (
                  <ThemedText style={styles.hint}>
                    {t('transactions.rateSeeded', { date: plainDate(latest.data!.rate_date) })}
                  </ThemedText>
                )}
              </>
            )}

            {isTransfer && received != null && (
              <View style={styles.receivedBar} testID="tx-received">
                <ThemedText style={styles.receivedLabel}>
                  {t('transactions.receives', { account: to.label })}
                </ThemedText>
                <ThemedText style={styles.receivedValue}>{money(received, to.currency)}</ThemedText>
              </View>
            )}

            <ThemedText style={[styles.label, styles.spaced]}>{t('transactions.notes')}</ThemedText>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={notes}
              onChangeText={setNotes}
              multiline
              testID="tx-notes"
            />

            <TouchableOpacity
              style={[styles.submit, (saving || !!problem) && styles.submitOff]}
              onPress={submit}
              disabled={saving}
              testID="tx-submit"
            >
              <ThemedText style={styles.submitText}>
                {t('transactions.record')}
              </ThemedText>
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
  hint: { fontSize: 12, opacity: 0.55, marginTop: 6 },
  warn: { fontSize: 12, fontWeight: '600', color: '#b45309', marginTop: 6 },
  clear: { fontSize: 13, fontWeight: '600', color: '#5469D4', marginTop: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  receivedBar: {
    marginTop: 16,
    backgroundColor: '#eef2ff',
    borderRadius: 12,
    padding: 14,
    gap: 2,
  },
  receivedLabel: { fontSize: 13, fontWeight: '600', opacity: 0.7 },
  receivedValue: { fontSize: 18, fontWeight: '700', color: '#312e81' },
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
