import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { money, perCurrency } from '@/utils/money';
import { formatNumericDate, plainDate, plainDayOfMonth, todayPlain } from '@/utils/date';

interface LedgerEntry {
  uuid: string;
  entry_type: string;
  amount: number;
  currency: string;
  /** present on every entry, null on anything that is not a charge */
  period?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  /** these three exist ONLY on a charge — absent, not null, on payments and adjustments */
  is_paid?: boolean | null;
  outstanding?: number | null;
  paid_amount?: number | null;
  /** only on a payment that settles a specific charge */
  settles_period_start?: string | null;
  settles_period_end?: string | null;
  notes?: string | null;
  created_at: string;
}

interface Billing {
  company_name?: string | null;
  subscription: { rate?: number | null; currency?: string | null; type?: string | null };
  total_outstanding?: Record<string, number> | null;
  balances?: Record<string, number> | null;
  unpaid_count?: number | null;
  billing_day?: string | null;
  next_charge_on?: string | null;
  entries?: LedgerEntry[] | null;
}

/**
 * What this company is paying, and what it has been billed. READ ONLY, because the API is.
 *
 * The whole /account blueprint is a single GET: every write verb on it returns 405, and
 * every editable field — the company name, the contact details, the subscription rate, the
 * verification and blocked flags — lives behind the platform-owner routes instead. So this
 * is not a screen that declined to offer writes; there are none to offer. It says so in the
 * footer rather than leaving someone hunting for an edit button.
 *
 * There is deliberately no "pay now" either. The tenant is not the party that records a
 * payment here, and a ledger entry invented from a van is the worst thing this screen could
 * learn to do.
 *
 * BALANCES IS NOT RENDERED, and that is the most consequential decision here. One live
 * payload carries `balances {USD: -20}` next to `total_outstanding {USD: 120}` — a
 * 140-dollar disagreement about the same company at the same instant, because a payment
 * that settles no specific charge lowers the balance while leaving every charge
 * outstanding. Both numbers are honest answers to different questions, and two centimetres
 * apart on a phone they read as a broken app. Outstanding is the one a tenant acts on. The
 * web page declares balances in its own types and never renders it either.
 */
export default function AccountSettingsScreen() {
  const { t, tef } = useLanguage();

  const TYPE_LABEL: Record<string, string> = {
    charge: t('account.typeCharge'),
    payment: t('account.typePayment'),
    adjustment: t('account.typeAdjustment'),
  };

  const rows = (b: Billing): DetailRow[] => {
    const sub = b.subscription ?? {};
    const hasSub = sub.rate != null && !!sub.currency;
    const unpaid = b.unpaid_count ?? 0;
    const hasEntries = !!b.entries?.length;

    const all: (DetailRow | null)[] = [
      [
        t('account.subscription'),
        hasSub
          ? `${money(sub.rate, sub.currency)} · ${
              sub.type === 'per_user' ? t('account.perUserPerMonth') : t('account.perMonth')
            }`
          : t('account.noSubscription'),
      ],
      [
        t('account.outstanding'),
        Object.keys(b.total_outstanding ?? {}).length
          ? perCurrency(b.total_outstanding)
          : t('account.allSettled'),
      ],
      // its own row, never appended to a per-currency figure: this is a count of charges
      // spanning every currency, so printing it beside one currency's total would read as
      // "2 charges in USD" when it may not be
      unpaid > 0 ? [t('account.unpaidLabel'), t('account.chargeCount', { n: unpaid })] : null,
      [t('account.billingDay'), t('account.dayOfMonth', { day: plainDayOfMonth(b.billing_day) })],
      // suppressed entirely when nothing has ever been billed: the API still returns a
      // next_charge_on then, and it is the billing day already in the past
      !hasEntries
        ? null
        : [
            t('account.nextCharge'),
            (b.next_charge_on ?? '') <= todayPlain()
              ? t('account.dueNow')
              : plainDate(b.next_charge_on),
          ],
    ];
    return all.filter(Boolean) as DetailRow[];
  };

  const period = (e: LedgerEntry) => {
    if (e.period_start && e.period_end) {
      return `${plainDate(e.period_start)} – ${plainDate(e.period_end)}`;
    }
    if (e.settles_period_start && e.settles_period_end) {
      return t('account.settles', {
        range: `${plainDate(e.settles_period_start)} – ${plainDate(e.settles_period_end)}`,
      });
    }
    return e.period ?? '—';
  };

  return (
    <ModuleDetailScreen<Billing>
      requireAdmin
      title={t('menu.accountSettings')}
      // exactly this path: a trailing slash is a 404 here, not a redirect
      endpoint="/account/billing"
      heading={(b) => b.company_name || t('account.noName')}
      rows={rows}
      sections={[
        {
          title: t('account.history'),
          isEmpty: (b) => !b.entries?.length,
          emptyText: t('account.noHistory'),
          render: (b) => (
            <>
              {(b.entries ?? []).map((e) => (
                <View key={e.uuid} style={styles.entry}>
                  <View style={styles.entryTop}>
                    <ThemedText style={styles.type}>
                      {TYPE_LABEL[e.entry_type] ?? tef(e.entry_type)}
                    </ThemedText>
                    <ThemedText
                      style={[
                        styles.amount,
                        e.amount < 0 ? styles.amountOut : styles.amountIn,
                      ]}
                    >
                      {money(e.amount, e.currency)}
                    </ThemedText>
                  </View>
                  <View style={styles.entryTop}>
                    <ThemedText style={styles.period} numberOfLines={1}>
                      {period(e)}
                    </ThemedText>
                    {/* loose == null on purpose: the key is ABSENT on a payment or an
                        adjustment, and null-filled by the platform-owner route, so an
                        `in`-based test would make the two screens disagree */}
                    {e.is_paid != null && (
                      <ThemedText style={e.is_paid ? styles.paid : styles.due}>
                        {e.is_paid ? t('account.paid') : t('account.due')}
                      </ThemedText>
                    )}
                  </View>
                  {!!e.notes && (
                    <ThemedText style={styles.notes} numberOfLines={2}>
                      {e.notes}
                    </ThemedText>
                  )}
                  <ThemedText style={styles.when}>
                    {e.created_at ? formatNumericDate(new Date(e.created_at)) : ''}
                  </ThemedText>
                </View>
              ))}
            </>
          ),
        },
      ]}
      footer={(b) => (
        <>
          <ThemedText style={styles.footer}>{t('account.readOnly')}</ThemedText>
          {/* the ledger is hard-capped server-side with no total and no working page
              param, so a full page is the only truncation signal that exists and there is
              nothing a "load more" control could send */}
          {b.entries?.length === 100 && (
            <ThemedText style={styles.footer}>{t('account.truncated')}</ThemedText>
          )}
        </>
      )}
    />
  );
}

const styles = StyleSheet.create({
  entry: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.07)',
    gap: 3,
  },
  entryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  type: { fontSize: 14, fontWeight: '700', color: '#1f2937' },
  amount: { fontSize: 14, fontWeight: '700' },
  amountOut: { color: '#dc2626' },
  amountIn: { color: '#15803d' },
  period: { flex: 1, fontSize: 12, opacity: 0.6 },
  paid: {
    fontSize: 10,
    fontWeight: '700',
    color: '#15803d',
    backgroundColor: '#dcfce7',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  due: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400e',
    backgroundColor: '#fef3c7',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  notes: { fontSize: 12, opacity: 0.6, lineHeight: 17 },
  when: { fontSize: 11, opacity: 0.45 },
  footer: { fontSize: 12, opacity: 0.6, lineHeight: 18, marginTop: 16 },
});
