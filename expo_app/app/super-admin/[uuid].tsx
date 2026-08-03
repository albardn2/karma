import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailRow, DetailAction } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';

interface Account {
  uuid: string;
  company_name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  is_blocked?: boolean | null;
  is_verified?: boolean | null;
  verified_at?: string | null;
  user_count?: number | null;
  subscription_type?: string | null;
  subscription_rate?: number | null;
  subscription_currency?: string | null;
  balances?: Record<string, number> | null;
  created_at: string;
}

interface Charge {
  uuid: string;
  period?: string | null;
  amount?: number | null;
  currency?: string | null;
  outstanding?: number | null;
  is_paid?: boolean | null;
}

/**
 * One tenant, and the two levers worth having on a phone.
 *
 * VERIFY approves a signup; BLOCK cuts an account off. Both are one field on
 * PUT /super-admin/accounts/<uuid> and both are the kind of thing a platform owner
 * genuinely needs away from a desk — a new customer waiting to be let in, or one that
 * has to be stopped now.
 *
 * Deliberately NOT here, and each for a reason rather than for scope:
 *
 * IMPERSONATE mints an 8-hour token that makes you act as another tenant. The app has
 * no way to show "you are currently acting as X" or to get back out, so a mis-tap in a
 * van would leave someone quietly operating inside a customer's data.
 *
 * SUBSCRIPTION RATE and the permission presets are money and policy configuration —
 * 38 resources times 4 actions in the presets' case. That is desk work, and a phone
 * form over it invites exactly the fat-fingered change nobody notices.
 *
 * LEDGER ENTRIES record real money moving. entry_type is a free-form string on the DTO
 * with no enum to offer, so a form here would be guessing at values; the ledger is
 * shown read-only instead.
 *
 * Balances and outstanding charges are per currency and never summed — with SYP and USD
 * three orders of magnitude apart since the redenomination, a combined figure would
 * look plausible and mean nothing.
 */
export default function SuperAdminAccountScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t, tef } = useLanguage();
  const [reloadKey, setReloadKey] = useState(0);
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [outstanding, setOutstanding] = useState<Record<string, number>>({});
  const [chargesFailed, setChargesFailed] = useState(false);

  const loadCharges = useCallback(async () => {
    setChargesFailed(false);
    const res = await apiCall<{ charges: Charge[]; total_outstanding: Record<string, number> }>(
      `/super-admin/accounts/${uuid}/unpaid-charges`,
    );
    if (!isOk(res.status)) {
      setChargesFailed(true);
      setCharges([]);
      return;
    }
    setCharges(res.data?.charges ?? []);
    setOutstanding(res.data?.total_outstanding ?? {});
  }, [uuid]);

  useEffect(() => {
    loadCharges();
  }, [loadCharges, reloadKey]);

  const money = (n?: number | null, c?: string | null) =>
    n == null ? '—' : `${Number(n).toFixed(2)}${c ? ` ${c}` : ''}`;

  const perCurrency = (b?: Record<string, number> | null) => {
    const entries = Object.entries(b ?? {});
    if (!entries.length) return '—';
    return entries.map(([cur, v]) => `${Number(v).toFixed(2)} ${cur}`).join(' · ');
  };

  /** One field, one PUT. The response is authoritative, so the screen refetches. */
  const setFlag = async (field: 'is_verified' | 'is_blocked', value: boolean, label: string) => {
    const res = await apiCall(`/super-admin/accounts/${uuid}`, {
      method: 'PUT',
      body: JSON.stringify({ [field]: value }),
    });
    if (isOk(res.status)) setReloadKey((k) => k + 1);
    else Alert.alert(label, String(res.error ?? '').slice(0, 300) || t('form.tryAgain'));
  };

  // DetailAction.visible was added for exactly this: which levers apply depends on the
  // record, which is only known after the fetch. The component also supplies the button
  // styling and the destructive confirm, so none of that is re-implemented here.
  const actions: DetailAction<Account>[] = [
    {
      label: t('superAdmin.verify'),
      testID: 'account-verify',
      visible: (a) => !a.is_verified,
      onPress: () => setFlag('is_verified', true, t('superAdmin.verify')),
    },
    {
      label: t('superAdmin.unblock'),
      testID: 'account-unblock',
      visible: (a) => !!a.is_blocked,
      onPress: () => setFlag('is_blocked', false, t('superAdmin.unblock')),
    },
    {
      // destructive: the component asks first, which is the point — this stops a whole
      // company working
      label: t('superAdmin.block'),
      destructive: true,
      testID: 'account-block',
      visible: (a) => !a.is_blocked,
      onPress: () => setFlag('is_blocked', true, t('superAdmin.block')),
    },
  ];

  return (
    <ModuleDetailScreen<Account>
      requireScope="superuser"
      title={t('menu.superAdmin')}
      endpoint={`/super-admin/accounts/${uuid}`}
      reloadKey={reloadKey}
      heading={(a) => a.company_name || t('superAdmin.unnamed')}
      rows={(a): DetailRow[] => [
        [
          t('superAdmin.state'),
          a.is_blocked
            ? t('superAdmin.blocked')
            : a.is_verified
              ? t('superAdmin.verified')
              : t('superAdmin.pending'),
        ],
        [t('superAdmin.userCount'), String(a.user_count ?? 0)],
        [t('superAdmin.balance'), perCurrency(a.balances)],
        [t('superAdmin.outstanding'), perCurrency(outstanding)],
        [
          t('superAdmin.subscription'),
          a.subscription_type
            ? `${tef(a.subscription_type)}${
                a.subscription_rate != null
                  ? ` · ${money(a.subscription_rate, a.subscription_currency)}`
                  : ''
              }`
            : '—',
        ],
        [t('superAdmin.email'), a.email || '—'],
        [t('superAdmin.phone'), a.phone_number || '—'],
        [
          t('superAdmin.created'),
          a.created_at ? formatNumericDate(new Date(a.created_at)) : '—',
        ],
      ]}
      sections={[
        {
          title: t('superAdmin.unpaidCharges'),
          isEmpty: () => !charges?.length,
          emptyText: chargesFailed ? t('moduleList.failed') : t('superAdmin.nothingUnpaid'),
          render: () => (
            <>
              {(charges ?? []).map((c) => (
                <View key={c.uuid} style={styles.charge}>
                  <View style={styles.chargeLeft}>
                    <ThemedText style={styles.period}>{c.period || '—'}</ThemedText>
                    <ThemedText style={styles.chargeMeta}>
                      {money(c.amount, c.currency)}
                    </ThemedText>
                  </View>
                  <ThemedText style={styles.owed}>
                    {money(c.outstanding, c.currency)}
                  </ThemedText>
                </View>
              ))}
            </>
          ),
        },
      ]}
      actions={actions}
    />
  );
}

const styles = StyleSheet.create({
  charge: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  chargeLeft: { flex: 1 },
  period: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  chargeMeta: { fontSize: 11, opacity: 0.55, marginTop: 1 },
  owed: { fontSize: 14, fontWeight: '700', color: '#991b1b' },
});
