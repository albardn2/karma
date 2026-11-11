import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { EditSheet, editSheetInput } from '@/components/EditSheet';
import { OrderStatusBadges, badgeStyles } from '@/components/OrderStatusBadges';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useHasEndpoint } from '@/hooks/useModuleAccess';
import { apiCall, isOk, apiErrorText } from '@/utils/api';
import { formatNumericDate, parseTs } from '@/utils/date';
import { money, parseAmount, parseWholeNumber } from '@/utils/money';
import { markListsStale, setListFlash } from '@/utils/listRefresh';
import {
  MONEY_LISTS,
  MONEY_TOLERANCE,
  ORDER_LISTS,
  STOCK_LISTS,
  hasBalance,
  liveOrderItems,
  payState,
} from '@/utils/orderStatus';

interface OrderItem {
  uuid: string;
  material_name?: string | null;
  quantity: number;
  unit?: string | null;
  is_fulfilled?: boolean | null;
  is_deleted?: boolean | null;
  fulfilled_at?: string | null;
}

interface InvoiceItem {
  uuid: string;
  customer_order_item_uuid?: string | null;
  material_name?: string | null;
  quantity?: number | null;
  price_per_unit?: number | null;
  total_price?: number | null;
  is_deleted?: boolean | null;
}

interface Invoice {
  uuid: string;
  currency?: string | null;
  status?: string | null;
  due_date?: string | null;
  is_paid?: boolean | null;
  is_overdue?: boolean | null;
  is_deleted?: boolean | null;
  net_amount_due?: number | null;
  net_amount_paid?: number | null;
  total_adjusted_amount?: number | null;
  invoice_items?: InvoiceItem[] | null;
}

interface Order {
  uuid: string;
  created_at: string;
  currency?: string | null;
  is_fulfilled: boolean;
  is_paid?: boolean | null;
  is_overdue: boolean;
  total_adjusted_amount: number;
  net_amount_paid?: number | null;
  net_amount_due?: number | null;
  customer_company_name?: string | null;
  customer_full_name?: string | null;
  notes?: string | null;
  customer_order_items?: OrderItem[] | null;
}

/** The with-items-and-invoice endpoint wraps the record. */
interface OrderPayload {
  customer_order: Order;
  invoices?: Invoice[] | null;
  /** server-decided price editability: "unpaid" | "single_payment" | "locked" */
  price_edit_state?: string | null;
  /** server-decided: whether the guarded delete would succeed */
  can_delete?: boolean | null;
}

/**
 * One order: what was sold, what is owed, and what can be done about it.
 *
 * The fulfil-and-take-payment flow is NOT rebuilt here. The app already has that
 * screen at app/distribution/order.tsx, and it reads tripStopUuid as optional and
 * sends `trip_stop_uuid: tripStopUuid || null` — so it works perfectly well entered
 * from the menu rather than from a trip. Routing to it keeps one implementation of
 * the money path instead of a second one that drifts. Per-invoice payment reuses the
 * same screen with an invoiceUuid param, for the same reason. The button says which
 * half is left to do — fulfil, take payment, or both — and is gone once neither is.
 *
 * TWO DELETES, deliberately. "Delete order" is the guarded cascade — admin-only, and
 * refused once anything real has happened (a line delivered, money received), so the
 * button only shows where it can succeed. "Void order" is the unguarded admin cascade
 * that reverses EVERYTHING — items, invoice, recorded payments, stock movements — even
 * on settled orders. Each confirm says what it does, so the two read as different
 * things rather than two names for one.
 *
 * Items are mostly immutable after creation — materials stay the billing
 * contract, fixed by void-and-recreate. Two in-place edits exist, both gated by
 * the server's payment state (price_edit_state) AND the caller's endpoint grant:
 * price per unit — freely while nothing is paid, or on a fully-paid order settled
 * by a single payment (that payment absorbs the delta so the order stays exactly
 * paid) — and quantity, only while FULLY unpaid, because on a fulfilled line it
 * also re-syncs warehouse and vehicle stock. Everything else is locked server-side.
 */
export default function CustomerOrderDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const { t, tef } = useLanguage();
  const { isAdmin } = useAuth();
  // the server's gate for a non-admin is the endpoint grant, not the payment
  // state alone — don't show a control that will answer 403
  const canUpdateLine = useHasEndpoint('customer_order_item', 'update');
  const canUpdatePrice = useHasEndpoint('invoice_item', 'update');
  const canEditOrder = useHasEndpoint('customer_order', 'update');
  // fulfil and unfulfil are both POSTs on customer_order_item
  const canFulfil = useHasEndpoint('customer_order_item', 'create');
  const canTakePayment = useHasEndpoint('payment', 'create');
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  // A delete or void can answer after the user has already gone back; going
  // back again then would pop whatever screen they are on now. Set in the
  // effect body as well as cleared in its cleanup: Fast Refresh and React's
  // strict-mode remount run the cleanup and then the effect again, and a ref
  // that is only ever cleared stays false for good — the void went through and
  // the screen never left.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const leave = () => {
    if (!mountedRef.current) return;
    if (router.canGoBack()) router.back();
    else router.replace('/customer-orders');
  };

  // notes editor state — the draft is seeded from the fetched record when opened
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  // price editor state — one invoice line at a time, seeded with its current price
  const [priceItem, setPriceItem] = useState<InvoiceItem | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [priceError, setPriceError] = useState('');
  const [priceSaving, setPriceSaving] = useState(false);

  const savePrice = async () => {
    if (!priceItem || priceSaving) return;
    // strict: parseFloat saved "12abc" as 12, and a non-number closed nothing
    // and said nothing
    const price = parseAmount(priceDraft);
    if (price == null) {
      setPriceError(t('customerOrders.priceInvalid'));
      return;
    }
    setPriceSaving(true);
    const res = await apiCall(`/invoice-item/${priceItem.uuid}/price`, {
      method: 'PUT',
      body: JSON.stringify({ price_per_unit: price }),
    });
    setPriceSaving(false);
    if (isOk(res.status)) {
      // a single-payment order moves its payment with the price
      markListsStale(...ORDER_LISTS, ...MONEY_LISTS);
      setPriceItem(null);
      reload();
    } else {
      Alert.alert(t('customerOrders.editPrice'), apiErrorText(res.error, t('form.tryAgain')));
    }
  };

  // quantity editor — targets the customer_order_item (where quantity lives);
  // totals recompute server-side and, if the line was fulfilled, stock re-syncs
  const [quantityItem, setQuantityItem] = useState<InvoiceItem | null>(null);
  const [quantityDraft, setQuantityDraft] = useState('');
  const [quantityError, setQuantityError] = useState('');
  const [quantitySaving, setQuantitySaving] = useState(false);

  const saveQuantity = async () => {
    const coiUuid = quantityItem?.customer_order_item_uuid;
    if (!coiUuid || quantitySaving) return;
    // whole units only — parseInt would silently save "2.5" as 2 and close the
    // sheet as if it worked, so validate the text, not the number
    const quantity = parseWholeNumber(quantityDraft);
    if (quantity == null) {
      setQuantityError(t('customerOrders.quantityWholeNumber'));
      return;
    }
    setQuantitySaving(true);
    const res = await apiCall(`/customer-order-item/${coiUuid}/quantity`, {
      method: 'PUT',
      body: JSON.stringify({ quantity }),
    });
    setQuantitySaving(false);
    if (isOk(res.status)) {
      markListsStale(...ORDER_LISTS, ...STOCK_LISTS);
      setQuantityItem(null);
      reload();
    } else {
      Alert.alert(t('customerOrders.editQuantity'), apiErrorText(res.error, t('form.tryAgain')));
    }
  };

  const remove = async () => {
    // the with-items variant so line items and the invoice go too, rather than
    // leaving orphans behind the order. Success is HTTP 201 here — isOk covers it.
    const res = await apiCall(`/customer-order/with-items-and-invoice/${uuid}`, {
      method: 'DELETE',
    });
    if (isOk(res.status)) {
      markListsStale(...ORDER_LISTS);
      setListFlash('/customer-order/', t('customerOrders.deleted'));
      leave();
    } else {
      Alert.alert(t('detail.delete'), apiErrorText(res.error, t('form.tryAgain')));
    }
  };

  const voidOrder = async () => {
    const res = await apiCall(`/customer-order/${uuid}`, { method: 'DELETE' });
    if (isOk(res.status)) {
      // reverses payments and stock movements as well as the order
      markListsStale(...ORDER_LISTS, ...MONEY_LISTS, ...STOCK_LISTS);
      setListFlash('/customer-order/', t('customerOrders.voided'));
      leave();
    } else {
      Alert.alert(t('customerOrders.void'), apiErrorText(res.error, t('form.tryAgain')));
    }
  };

  const saveNotes = async () => {
    if (notesSaving) return;
    setNotesSaving(true);
    // exactly the notes key and nothing else: the update DTO is not exclude_unset,
    // so a body missing `notes` NULLS it silently, and any extra key 422s
    const res = await apiCall(`/customer-order/${uuid}`, {
      method: 'PUT',
      body: JSON.stringify({ notes: notesDraft.trim() ? notesDraft.trim() : null }),
    });
    setNotesSaving(false);
    if (isOk(res.status)) {
      markListsStale(...ORDER_LISTS);
      setNotesOpen(false);
      reload();
    } else {
      Alert.alert(t('customerOrders.editNotes'), apiErrorText(res.error, t('form.tryAgain')));
    }
  };

  // the line being unfulfilled: one request at a time, so a second tap during
  // the first does not send it twice
  const [unfulfilling, setUnfulfilling] = useState<string | null>(null);
  const unfulfilBusy = useRef(false);
  const unfulfil = (item: OrderItem) =>
    Alert.alert(t('customerOrders.unfulfil'), t('customerOrders.unfulfilConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('customerOrders.unfulfil'),
        style: 'destructive',
        onPress: async () => {
          if (unfulfilBusy.current) return;
          unfulfilBusy.current = true;
          setUnfulfilling(item.uuid);
          try {
            // soft-deletes the sale's inventory event, so the stock returns
            const res = await apiCall('/customer-order-item/unfulfill-items', {
              method: 'POST',
              body: JSON.stringify({ items: [{ customer_order_item_uuid: item.uuid }] }),
            });
            if (isOk(res.status)) {
              markListsStale(...ORDER_LISTS, ...STOCK_LISTS);
              reload();
            } else {
              Alert.alert(t('customerOrders.unfulfil'), apiErrorText(res.error, t('form.tryAgain')));
            }
          } finally {
            unfulfilBusy.current = false;
            setUnfulfilling(null);
          }
        },
      },
    ]);

  // what is left to do on the order, as far as this user may do it
  const toFulfil = (d: OrderPayload) =>
    canFulfil && liveOrderItems(d.customer_order.customer_order_items).some((i) => !i.is_fulfilled);
  const toCollect = (d: OrderPayload) => canTakePayment && hasBalance(d.customer_order);
  const openActions = (intent?: 'fulfil' | 'pay') =>
    router.push({
      pathname: '/distribution/order',
      params: intent ? { orderUuid: uuid, intent } : { orderUuid: uuid },
    });

  return (
    <>
      <ModuleDetailScreen<OrderPayload>
        module="customer-orders"
        title={t('menu.customerOrders')}
        endpoint={`/customer-order/with-items-and-invoice/${uuid}`}
        reloadKey={reloadKey}
        // fulfil-and-pay and an invoice's record-payment open a screen that writes,
        // and coming back pops to this one without remounting it
        reloadOnFocus
        heading={(d) =>
          d.customer_order.customer_company_name ||
          d.customer_order.customer_full_name ||
          t('customerOrders.noCustomer')
        }
        subheading={(d) => <OrderStatusBadges order={d.customer_order} style={styles.badges} />}
        rows={(d): DetailRow[] => {
          const o = d.customer_order;
          return [
            [t('customerOrders.total'), money(o.total_adjusted_amount, o.currency)],
            [t('customerOrders.paidAmount'), money(o.net_amount_paid, o.currency)],
            [t('customerOrders.due'), money(o.net_amount_due, o.currency)],
            // naive UTC: read as local it showed an evening order on the next day
            [t('customerOrders.orderedOn'), formatNumericDate(parseTs(o.created_at))],
            [t('customerOrders.notes'), o.notes || '—'],
          ];
        }}
        sections={[
          {
            title: t('customerOrders.itemsTitle'),
            isEmpty: (d) => !liveOrderItems(d.customer_order.customer_order_items).length,
            emptyText: t('customerOrders.noItems'),
            render: (d) => (
              <>
                {liveOrderItems(d.customer_order.customer_order_items).map((it) => (
                  <View key={it.uuid} style={styles.line}>
                    <ThemedText style={styles.lineName} numberOfLines={2}>
                      {it.material_name || '—'}
                    </ThemedText>
                    <ThemedText style={styles.lineQty}>
                      {it.quantity}
                      {it.unit ? ` ${it.unit}` : ''}
                    </ThemedText>
                    {/* per-line, because an order is routinely part-delivered */}
                    <ThemedText
                      style={[badgeStyles.badge, it.is_fulfilled ? badgeStyles.ok : badgeStyles.neutral]}
                    >
                      {it.is_fulfilled
                        ? t('customerOrders.fulfilled')
                        : t('customerOrders.unfulfilled')}
                    </ThemedText>
                    {!!it.is_fulfilled && canFulfil && (
                      <TouchableOpacity
                        onPress={() => unfulfil(it)}
                        disabled={!!unfulfilling}
                        hitSlop={8}
                        testID={`unfulfil-${it.uuid}`}
                      >
                        <ThemedText
                          style={[styles.unfulfil, !!unfulfilling && styles.linkBusy]}
                        >
                          {t('customerOrders.unfulfil')}
                        </ThemedText>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </>
            ),
          },
          {
            title: t('customerOrders.invoices'),
            isEmpty: (d) => !(d.invoices ?? []).filter((i) => !i.is_deleted).length,
            emptyText: t('customerOrders.noInvoices'),
            render: (d) => (
              <>
                {(d.invoices ?? [])
                  .filter((i) => !i.is_deleted)
                  .map((inv) => {
                    const state = payState(inv);
                    return (
                      <View key={inv.uuid} style={styles.invoice}>
                        <View style={styles.invoiceTop}>
                          <ThemedText style={styles.invoiceAmount}>
                            {money(inv.net_amount_due, inv.currency)} {t('customerOrders.due')}
                          </ThemedText>
                          {/* coloured by what it says — it was grey even when Paid */}
                          {state === 'free' ? (
                            <ThemedText style={[badgeStyles.badge, badgeStyles.neutral]}>
                              {t('customerOrders.noCharge')}
                            </ThemedText>
                          ) : (
                            !!inv.status && (
                              <ThemedText
                                style={[
                                  badgeStyles.badge,
                                  inv.status === 'paid'
                                    ? badgeStyles.ok
                                    : inv.status === 'pending'
                                      ? badgeStyles.due
                                      : badgeStyles.neutral,
                                ]}
                              >
                                {tef(inv.status)}
                              </ThemedText>
                            )
                          )}
                          {inv.is_overdue && (
                            <ThemedText style={[badgeStyles.badge, badgeStyles.overdue]}>
                              {t('customerOrders.overdue')}
                            </ThemedText>
                          )}
                        </View>
                        <ThemedText style={styles.invoiceMeta}>
                          {t('customerOrders.paidAmount')} {money(inv.net_amount_paid, inv.currency)}
                          {inv.due_date
                            ? ` · ${t('customerOrders.dueOn', {
                                date: formatNumericDate(parseTs(inv.due_date)),
                              })}`
                            : ''}
                        </ThemedText>
                        {d.price_edit_state === 'single_payment' && (
                          <ThemedText style={styles.priceNote}>
                            {t('customerOrders.priceEditPaymentNote')}
                          </ThemedText>
                        )}
                        {(inv.invoice_items ?? [])
                          .filter((li) => !li.is_deleted)
                          .map((li) => (
                            // the name on a line of its own: sharing one row with
                            // the figures and two edit links squeezed it to "E…"
                            <View key={li.uuid} style={styles.invoiceLine}>
                              <ThemedText style={styles.invoiceLineName} numberOfLines={2}>
                                {li.material_name || '—'}
                              </ThemedText>
                              <View style={styles.invoiceLineRow}>
                                <ThemedText style={styles.invoiceLineFigures}>
                                  {li.quantity ?? '—'} × {money(li.price_per_unit, null)} ={' '}
                                  {money(li.total_price, inv.currency)}
                                </ThemedText>
                                {/* price edit: only when the ORDER's payment state allows
                                    (server-decided) and the caller holds the update grant */}
                                {canUpdatePrice &&
                                  (d.price_edit_state === 'unpaid' ||
                                    d.price_edit_state === 'single_payment') && (
                                    <TouchableOpacity
                                      onPress={() => {
                                        setPriceDraft(String(li.price_per_unit ?? ''));
                                        setPriceError('');
                                        setPriceItem(li);
                                      }}
                                      hitSlop={8}
                                      testID={`edit-price-${li.uuid}`}
                                    >
                                      <ThemedText style={styles.editPrice}>
                                        {t('customerOrders.editPrice')}
                                      </ThemedText>
                                    </TouchableOpacity>
                                  )}
                                {/* quantity edit needs a FULLY unpaid order (it can
                                    move stock); a stricter gate than price */}
                                {canUpdateLine &&
                                  d.price_edit_state === 'unpaid' &&
                                  li.customer_order_item_uuid && (
                                    <TouchableOpacity
                                      onPress={() => {
                                        setQuantityDraft(String(li.quantity ?? ''));
                                        setQuantityError('');
                                        setQuantityItem(li);
                                      }}
                                      hitSlop={8}
                                      testID={`edit-quantity-${li.uuid}`}
                                    >
                                      <ThemedText style={styles.editPrice}>
                                        {t('customerOrders.editQuantity')}
                                      </ThemedText>
                                    </TouchableOpacity>
                                  )}
                              </View>
                            </View>
                          ))}
                        {/* per-invoice, so a second invoice on the order is payable
                            directly rather than only whichever happens to be first.
                            Payment only: it used to open with "mark fulfilled" on, so
                            recording cash also handed the goods over. */}
                        {canTakePayment && (inv.net_amount_due ?? 0) > MONEY_TOLERANCE && (
                          <TouchableOpacity
                            style={styles.payBtn}
                            onPress={() => {
                              router.push({
                                pathname: '/distribution/order',
                                params: { orderUuid: uuid, invoiceUuid: inv.uuid, intent: 'pay' },
                              });
                            }}
                            testID={`pay-invoice-${inv.uuid}`}
                          >
                            <ThemedText style={styles.payBtnText}>
                              {t('customerOrders.recordPayment')}
                            </ThemedText>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
              </>
            ),
          },
        ]}
        actions={[
          // one of three, by what is left — on a settled order it led to a screen
          // that could only say "fully settled"
          {
            label: t('customerOrders.fulfilAndPay'),
            testID: 'order-fulfil-pay',
            visible: (d) => toFulfil(d) && toCollect(d),
            onPress: () => openActions(),
          },
          {
            label: t('customerOrders.takePayment'),
            testID: 'order-take-payment',
            visible: (d) => !toFulfil(d) && toCollect(d),
            onPress: () => openActions('pay'),
          },
          {
            label: t('customerOrders.fulfilItems'),
            testID: 'order-fulfil-items',
            visible: (d) => toFulfil(d) && !toCollect(d),
            onPress: () => openActions('fulfil'),
          },
          {
            label: t('customerOrders.editNotes'),
            testID: 'order-edit-notes',
            visible: () => canEditOrder,
            onPress: (d) => {
              setNotesDraft(d.customer_order.notes ?? '');
              setNotesOpen(true);
            },
          },
          {
            label: t('detail.delete'),
            destructive: true,
            confirmText: t('customerOrders.deleteConfirm'),
            testID: 'order-delete',
            // Admin-only server-side, and refused once a line is delivered, money
            // has been received, or a line has notes or stock events. The server
            // says which (can_delete): the app cannot see payments or notes, and
            // judged on the order's net amount paid it offered Delete on a
            // refunded order. The local rule is the fallback for an older server.
            visible: (d) =>
              isAdmin &&
              (d.can_delete ??
                (!liveOrderItems(d.customer_order.customer_order_items).some(
                  (i) => i.is_fulfilled,
                ) &&
                  Number(d.customer_order.net_amount_paid ?? 0) <= MONEY_TOLERANCE)),
            onPress: remove,
          },
          {
            label: t('customerOrders.void'),
            destructive: true,
            confirmText: t('customerOrders.voidConfirm'),
            testID: 'order-void',
            // admin-only server-side (sales gets 403); reverses everything including
            // recorded payments and stock, even on settled orders
            visible: () => isAdmin,
            onPress: voidOrder,
          },
        ]}
      />

      <EditSheet
        visible={notesOpen}
        title={t('customerOrders.editNotes')}
        saving={notesSaving}
        onCancel={() => setNotesOpen(false)}
        onSave={saveNotes}
        saveTestID="order-notes-save"
      >
        <TextInput
          style={[editSheetInput.field, editSheetInput.multiline]}
          value={notesDraft}
          onChangeText={setNotesDraft}
          placeholder={t('customerOrders.notesPlaceholder')}
          placeholderTextColor="#9ca3af"
          multiline
          autoFocus
          testID="order-notes-input"
        />
      </EditSheet>

      <EditSheet
        visible={!!priceItem}
        title={`${t('customerOrders.editPrice')}${
          priceItem?.material_name ? ` — ${priceItem.material_name}` : ''
        }`}
        saving={priceSaving}
        onCancel={() => setPriceItem(null)}
        onSave={savePrice}
        saveTestID="order-price-save"
      >
        <TextInput
          style={editSheetInput.field}
          value={priceDraft}
          onChangeText={(v) => {
            setPriceDraft(v);
            setPriceError('');
          }}
          keyboardType="decimal-pad"
          placeholder={t('customerOrders.newPricePerUnit')}
          placeholderTextColor="#9ca3af"
          autoFocus
          testID="order-price-input"
        />
        {!!priceError && (
          <ThemedText style={editSheetInput.error} testID="order-price-error">
            {priceError}
          </ThemedText>
        )}
      </EditSheet>

      <EditSheet
        visible={!!quantityItem}
        title={`${t('customerOrders.editQuantity')}${
          quantityItem?.material_name ? ` — ${quantityItem.material_name}` : ''
        }`}
        saving={quantitySaving}
        onCancel={() => setQuantityItem(null)}
        onSave={saveQuantity}
        saveTestID="order-quantity-save"
      >
        <TextInput
          style={editSheetInput.field}
          value={quantityDraft}
          onChangeText={(v) => {
            setQuantityDraft(v);
            setQuantityError('');
          }}
          keyboardType="number-pad"
          placeholder={t('customerOrders.newQuantity')}
          placeholderTextColor="#9ca3af"
          autoFocus
          testID="order-quantity-input"
        />
        {!!quantityError && (
          <ThemedText style={editSheetInput.error} testID="order-quantity-error">
            {quantityError}
          </ThemedText>
        )}
      </EditSheet>
    </>
  );
}

const styles = StyleSheet.create({
  badges: { marginTop: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  lineName: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '600', color: '#1f2937' },
  lineQty: { fontSize: 14, opacity: 0.7 },
  unfulfil: { fontSize: 12, fontWeight: '700', color: '#dc2626' },
  linkBusy: { opacity: 0.4 },
  invoice: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.07)',
  },
  invoiceTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  invoiceAmount: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1f2937' },
  invoiceMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  invoiceLine: { marginTop: 6, paddingLeft: 6 },
  invoiceLineName: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: '#374151' },
  invoiceLineRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 1 },
  invoiceLineFigures: { flex: 1, fontSize: 12, opacity: 0.6 },
  editPrice: { fontSize: 12, fontWeight: '700', color: '#5469D4' },
  priceNote: { fontSize: 11, color: '#B45309', lineHeight: 15, marginTop: 6 },
  payBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#5469D4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  payBtnText: { fontSize: 12, fontWeight: '700', color: '#5469D4' },
});
