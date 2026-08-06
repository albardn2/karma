import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailAction, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useHasEndpoint } from '@/hooks/useModuleAccess';
import { apiCall, isOk } from '@/utils/api';
import { money } from '@/utils/money';
import { formatNumericDate, parseTs, plainDate } from '@/utils/date';

interface PurchaseOrderItem {
  uuid: string;
  material_uuid?: string | null;
  material_name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  price_per_unit?: number | null;
  total_price?: number | null;
  /** the line's OWN currency — not necessarily the order's */
  currency?: string | null;
  is_fulfilled?: boolean | null;
  fulfilled_at?: string | null;
  /** the embedded array is not filtered on this — see the docstring */
  is_deleted?: boolean | null;
}

interface Payout {
  uuid: string;
  amount?: number | null;
  currency?: string | null;
  notes?: string | null;
  created_at: string;
}

interface PurchaseOrder {
  uuid: string;
  vendor_uuid?: string | null;
  vendor_name?: string | null;
  status?: string | null;
  currency?: string | null;
  total_amount?: number | null;
  total_adjusted_amount?: number | null;
  net_amount_paid?: number | null;
  net_amount_due?: number | null;
  is_paid?: boolean | null;
  is_fulfilled?: boolean | null;
  is_overdue?: boolean | null;
  payout_due_date?: string | null;
  notes?: string | null;
  created_at: string;
  /** lines come back on the record itself under this key */
  purchase_order_items?: PurchaseOrderItem[] | null;
}

/**
 * A purchase order, its lines, its payouts, and the actions available on it.
 *
 * The lines arrive on the record under `purchase_order_items`, so no second request is
 * needed to list them — but that array is NOT filtered on `is_deleted`, while the
 * `total_amount` beside it is. A soft-deleted line therefore renders as live, with a
 * working Receive button, and the lines can disagree with the order's own total. Hence
 * `live()`.
 *
 * PER-LINE CURRENCY, not the order's. The read DTO carries a currency on each line and
 * only create-with-items overwrites it, so a line's price must be rendered at its own
 * currency or a mixed order would be reported wrongly at every row.
 *
 * WHY THERE IS NO "RECEIVED QUANTITY". `quantity_received` is never written by the
 * fulfilment path — it sets `is_fulfilled` and `fulfilled_at` and nothing else — so all
 * 79 lines on production read 0.0 while being fully received. Printing "Received 0 kg"
 * next to a green Received badge would be a lie, and substituting the ordered quantity
 * would invent a number the server never recorded. The badge is the whole truth
 * available.
 *
 * WHY THERE IS NO UNFULFIL. The endpoint exists and does write, but it leaves the
 * inventory lot live at zero — so every fulfil/unfulfil cycle strands a phantom lot in
 * the receive screen's own lot picker — and it reports success as an empty array, so a
 * UI cannot tell whether it worked. That needs fixing server-side before it is worth
 * offering.
 *
 * DELETE IS THE GUARDED ROUTE ONLY. /purchase-order/with-items/<uuid> voids the order
 * and soft-deletes its lines together; the loose route flips one flag and leaves the
 * lines live and queryable under a parent that then 404s. The button is hidden whenever
 * the server would refuse — received or paid — which on production today is every
 * existing order, and the footnote says why rather than leaving the absence a mystery.
 */
export default function PurchaseOrdersDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t, tef } = useLanguage();
  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  // a sub-fetch that FAILED must not read as one that returned nothing
  const [payoutsFailed, setPayoutsFailed] = useState(false);

  const canReceive = useHasEndpoint('purchase_order_item', 'create');
  const canEdit = useHasEndpoint('purchase_order', 'update');
  const canDelete = useHasEndpoint('purchase_order', 'delete');
  const canPayout = useHasEndpoint('payout', 'create');
  const canReadPayouts = useHasEndpoint('payout', 'read');

  const loadPayouts = useCallback(async () => {
    // a driver is 403 on /payout/ outright — don't ask, and don't show a failure for it
    if (!canReadPayouts) return;
    const res = await apiCall<{ payouts?: Payout[] }>(
      `/payout/?purchase_order_uuid=${uuid}&per_page=100`,
    );
    setPayoutsFailed(!isOk(res.status));
    setPayouts(isOk(res.status) ? (res.data?.payouts ?? []) : []);
  }, [uuid, canReadPayouts]);

  useEffect(() => {
    loadPayouts();
  }, [loadPayouts, reloadKey]);

  const qty = (n?: number | null) =>
    n == null ? '—' : Number.isInteger(n) ? String(n) : Number(n).toFixed(2);

  const live = (x: PurchaseOrder) =>
    (x.purchase_order_items ?? []).filter((li) => !li.is_deleted);

  /** mirrors the server's own delete guard, so the button is absent rather than fatal */
  const deletable = (x: PurchaseOrder) =>
    !x.is_paid &&
    Number(x.net_amount_paid ?? 0) === 0 &&
    !live(x).some((li) => li.is_fulfilled);

  const copyUuid = async () => {
    await Clipboard.setStringAsync(String(uuid));
    Alert.alert(t('purchaseOrders.copied'));
  };

  const remove = async () => {
    // the GUARDED route: it voids the order and soft-deletes the lines together
    const res = await apiCall(`/purchase-order/with-items/${uuid}`, { method: 'DELETE' });
    if (isOk(res.status)) {
      router.back();
      return;
    }
    Alert.alert(
      t('purchaseOrders.deleteFailed'),
      res.status === 400
        ? t('purchaseOrders.deleteBlocked')
        : res.status === 403
          ? t('purchaseOrders.forbidden')
          : String(res.error ?? '').slice(0, 300) || t('form.tryAgain'),
    );
  };

  const rows = (x: PurchaseOrder): DetailRow[] => {
    const out: DetailRow[] = [[t('purchaseOrders.total'), money(x.total_amount, x.currency)]];
    // only when an adjustment actually moved it — otherwise it is the same number twice
    if (
      x.total_adjusted_amount != null &&
      Math.abs(Number(x.total_adjusted_amount) - Number(x.total_amount ?? 0)) > 0.005
    ) {
      out.push([t('purchaseOrders.adjusted'), money(x.total_adjusted_amount, x.currency)]);
    }
    out.push(
      [t('purchaseOrders.paidAmount'), money(x.net_amount_paid, x.currency)],
      [t('purchaseOrders.outstanding'), money(x.net_amount_due, x.currency)],
      [t('purchaseOrders.status'), x.status ? tef(x.status) : '—'],
      [
        t('purchaseOrders.dueDate'),
        x.payout_due_date
          ? // string-split, never parsed: a naive-UTC midnight read through Date
            // shows the previous day for any viewer west of Greenwich
            `${plainDate(String(x.payout_due_date).slice(0, 10))}${
              x.is_overdue === true ? ` · ${t('purchaseOrders.overdue')}` : ''
            }`
          : '—',
      ],
      // parseTs, not new Date: created_at is naive UTC and a bare parse is off by a
      // day whenever the UTC time-of-day precedes the viewer's offset
      [t('purchaseOrders.when'), formatNumericDate(parseTs(x.created_at))],
      [t('purchaseOrders.orderUuid'), x.uuid],
    );
    return out;
  };

  const actions: DetailAction<PurchaseOrder>[] = [
    {
      label: t('payouts.record'),
      testID: 'po-payout',
      visible: (x) => canPayout && !x.is_paid && Number(x.net_amount_due ?? 0) > 0,
      onPress: (x) => {
        setReloadKey((k) => k + 1);
        router.push({
          pathname: '/payouts/create',
          params: {
            purchase_order_uuid: x.uuid,
            currency: x.currency ?? '',
            amount_due: x.net_amount_due != null ? String(x.net_amount_due) : '',
          },
        });
      },
    },
    {
      label: t('detail.edit'),
      testID: 'po-edit',
      visible: () => canEdit,
      onPress: (x) => {
        setReloadKey((k) => k + 1);
        router.push({
          pathname: '/purchase-orders/edit',
          params: {
            uuid: x.uuid,
            notes: x.notes ?? '',
            due: x.payout_due_date ?? '',
          },
        });
      },
    },
    {
      // the web offers six copyable uuids in a sidebar; one is the only one anyone
      // actually needs, and a row cannot be tapped so it is an action
      label: t('purchaseOrders.orderUuid'),
      testID: 'po-copy',
      onPress: copyUuid,
    },
    {
      label: t('detail.delete'),
      destructive: true,
      confirmText: (x) =>
        t('purchaseOrders.deleteConfirm', { lines: String(live(x).length) }),
      testID: 'po-delete',
      visible: (x) => canDelete && deletable(x),
      onPress: remove,
    },
  ];

  return (
    <ModuleDetailScreen<PurchaseOrder>
      module="purchase-orders"
      title={t('menu.purchaseOrders')}
      endpoint={`/purchase-order/${uuid}`}
      reloadKey={reloadKey}
      heading={(x) => x.vendor_name || t('purchaseOrders.noVendor')}
      subheading={(x) => (
        <View style={styles.subhead}>
          {/* the vendor is the heading, so the link rides here rather than becoming a
              fifth button above the card */}
          {!!x.vendor_uuid && (
            <TouchableOpacity
              onPress={() => router.push(`/vendors/${x.vendor_uuid}`)}
              testID="po-view-vendor"
              hitSlop={8}
            >
              <ThemedText style={styles.vendorLink}>
                {t('purchaseOrders.vendor')} ›
              </ThemedText>
            </TouchableOpacity>
          )}
          {/* null is UNKNOWN, not false: the model dereferences payout_due_date.tzinfo
              before its own None check and pydantic swallows the error into the
              Optional default, so 26 of 63 production orders report null */}
          {x.is_overdue === true && (
            <ThemedText style={styles.overdue}>{t('purchaseOrders.overdue')}</ThemedText>
          )}
        </View>
      )}
      rows={rows}
      actions={actions}
      sections={[
        {
          title: t('purchaseOrders.lines'),
          isEmpty: (x) => !live(x).length,
          emptyText: t('purchaseOrders.noLines'),
          render: (x) => (
            <>
              {live(x).map((li) => (
                <View key={li.uuid} style={styles.line}>
                  <View style={styles.lineLeft}>
                    <ThemedText style={styles.lineName} numberOfLines={1}>
                      {li.material_name ?? '—'}
                    </ThemedText>
                    <ThemedText style={styles.lineMeta}>
                      {qty(li.quantity)}
                      {li.unit ? ` ${tef(li.unit)}` : ''}
                      {/* the LINE's currency, not the order's */}
                      {li.price_per_unit != null
                        ? ` · ${money(li.price_per_unit, li.currency ?? x.currency)}`
                        : ''}
                      {li.total_price != null
                        ? ` · ${money(li.total_price, li.currency ?? x.currency)}`
                        : ''}
                    </ThemedText>
                    {!!li.fulfilled_at && (
                      <ThemedText style={styles.lineMeta}>
                        {formatNumericDate(parseTs(li.fulfilled_at))}
                      </ThemedText>
                    )}
                  </View>
                  {li.is_fulfilled ? (
                    <ThemedText style={styles.done}>{t('purchaseOrders.received')}</ThemedText>
                  ) : canReceive ? (
                    <TouchableOpacity
                      style={styles.receive}
                      testID={`po-receive-${li.uuid}`}
                      onPress={() => {
                        setReloadKey((k) => k + 1);
                        router.push({
                          pathname: '/purchase-orders/receive',
                          params: {
                            purchase_order_item_uuid: li.uuid,
                            material_name: li.material_name ?? '',
                            // narrows the lot picker: a wrong-material lot is a 400
                            material_uuid: li.material_uuid ?? '',
                            quantity: li.quantity != null ? String(li.quantity) : '',
                            unit: li.unit ?? '',
                          },
                        });
                      }}
                    >
                      <ThemedText style={styles.receiveText}>
                        {t('purchaseOrders.receive')}
                      </ThemedText>
                    </TouchableOpacity>
                  ) : (
                    <ThemedText style={styles.awaiting}>
                      {t('purchaseOrders.awaiting')}
                    </ThemedText>
                  )}
                </View>
              ))}
              {/* explains an absent Delete button rather than leaving it mysterious */}
              {canDelete && !deletable(x) && (
                <ThemedText style={styles.blocked}>
                  {t('purchaseOrders.deleteBlocked')}
                </ThemedText>
              )}
            </>
          ),
        },
        ...(canReadPayouts
          ? [
              {
                title: t('purchaseOrders.payouts'),
                isEmpty: () => !payouts.length,
                emptyText: payoutsFailed
                  ? t('moduleList.failed')
                  : t('purchaseOrders.noPayouts'),
                render: () => (
                  <>
                    {payouts.map((p) => (
                      <View key={p.uuid} style={styles.line}>
                        <View style={styles.lineLeft}>
                          <ThemedText style={styles.lineName}>
                            {money(p.amount, p.currency)}
                          </ThemedText>
                          <ThemedText style={styles.lineMeta}>
                            {formatNumericDate(parseTs(p.created_at))}
                            {p.notes ? ` · ${p.notes}` : ''}
                          </ThemedText>
                        </View>
                      </View>
                    ))}
                  </>
                ),
              } as const,
            ]
          : []),
      ]}
      footer={(x) =>
        x.notes ? (
          <View style={styles.notes}>
            <ThemedText style={styles.notesLabel}>{t('purchaseOrders.notes')}</ThemedText>
            <ThemedText style={styles.notesText}>{x.notes}</ThemedText>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  lineLeft: { flex: 1 },
  lineName: { fontSize: 14, fontWeight: '600', color: '#1f2937' },
  lineMeta: { fontSize: 11, opacity: 0.55, marginTop: 1 },
  done: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  awaiting: { fontSize: 12, opacity: 0.55 },
  blocked: { fontSize: 11, opacity: 0.5, lineHeight: 16, marginTop: 10 },
  subhead: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  vendorLink: { fontSize: 13, fontWeight: '700', color: '#5469D4', marginTop: 4 },
  overdue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#b91c1c',
    backgroundColor: '#fee2e2',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 4,
  },
  receive: {
    backgroundColor: '#5469D4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  receiveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  notes: { marginTop: 4 },
  notesLabel: { fontSize: 12, fontWeight: '700', opacity: 0.6, marginBottom: 4 },
  notesText: { fontSize: 14, lineHeight: 20, opacity: 0.85 },
});
