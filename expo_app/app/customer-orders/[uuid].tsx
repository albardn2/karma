import React, { useState } from 'react';
import {
  Alert,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';
import { money } from '@/utils/money';

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
}

/**
 * One order: what was sold, what is owed, and what can be done about it.
 *
 * The fulfil-and-take-payment flow is NOT rebuilt here. The app already has that
 * screen at app/distribution/order.tsx, and it reads tripStopUuid as optional and
 * sends `trip_stop_uuid: tripStopUuid || null` — so it works perfectly well entered
 * from the menu rather than from a trip. Routing to it keeps one implementation of
 * the money path instead of a second one that drifts. Per-invoice payment reuses the
 * same screen with an invoiceUuid param, for the same reason.
 *
 * TWO DELETES, deliberately. "Delete order" is the guarded cascade — the server
 * refuses it once anything real has happened (fulfilled, paid, or no live items), so
 * the button only shows where it can succeed; before this predicate it was shown
 * unconditionally and failed on exactly the orders people most wanted rid of. "Void
 * order" is the unguarded admin cascade that reverses EVERYTHING — items, invoice,
 * recorded payments, stock movements — even on settled orders. Its confirm spells
 * that out, because the web version hides the same power behind a bare confirm().
 *
 * Items are IMMUTABLE after creation, and that is the billing contract, not a gap:
 * the bulk item endpoint rejects prices and creates no invoice line, so an item added
 * later would be unpriced and invisible to the invoice totals. Fixing a wrong order
 * is void-and-recreate, never editing lines in place.
 */
export default function CustomerOrderDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const { t, tef } = useLanguage();
  const { isAdmin } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  // notes editor state — the draft is seeded from the fetched record when opened
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);

  const liveItems = (o: Order) =>
    (o.customer_order_items ?? []).filter((i) => !i.is_deleted);

  const remove = async () => {
    // the with-items variant so line items and the invoice go too, rather than
    // leaving orphans behind the order. Success is HTTP 201 here — isOk covers it.
    const res = await apiCall(`/customer-order/with-items-and-invoice/${uuid}`, {
      method: 'DELETE',
    });
    if (isOk(res.status)) router.back();
    else
      Alert.alert(
        t('detail.delete'),
        String(res.error ?? '').slice(0, 300) || t('form.tryAgain'),
      );
  };

  const voidOrder = async () => {
    const res = await apiCall(`/customer-order/${uuid}`, { method: 'DELETE' });
    if (isOk(res.status)) router.back();
    else
      Alert.alert(
        t('customerOrders.void'),
        String(res.error ?? '').slice(0, 300) || t('form.tryAgain'),
      );
  };

  const saveNotes = async () => {
    setNotesSaving(true);
    // exactly the notes key and nothing else: the update DTO is not exclude_unset,
    // so a body missing `notes` NULLS it silently, and any extra key 422s
    const res = await apiCall(`/customer-order/${uuid}`, {
      method: 'PUT',
      body: JSON.stringify({ notes: notesDraft.trim() ? notesDraft.trim() : null }),
    });
    setNotesSaving(false);
    if (isOk(res.status)) {
      setNotesOpen(false);
      setReloadKey((k) => k + 1);
    } else {
      Alert.alert(
        t('customerOrders.editNotes'),
        String(res.error ?? '').slice(0, 300) || t('form.tryAgain'),
      );
    }
  };

  const unfulfil = (item: OrderItem) =>
    Alert.alert(t('customerOrders.unfulfil'), t('customerOrders.unfulfilConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('customerOrders.unfulfil'),
        style: 'destructive',
        onPress: async () => {
          // soft-deletes the sale's inventory event, so the stock returns
          const res = await apiCall('/customer-order-item/unfulfill-items', {
            method: 'POST',
            body: JSON.stringify({ items: [{ customer_order_item_uuid: item.uuid }] }),
          });
          if (isOk(res.status)) setReloadKey((k) => k + 1);
          else
            Alert.alert(
              t('customerOrders.unfulfil'),
              String(res.error ?? '').slice(0, 300) || t('form.tryAgain'),
            );
        },
      },
    ]);

  return (
    <>
      <ModuleDetailScreen<OrderPayload>
        module="customer-orders"
        title={t('menu.customerOrders')}
        endpoint={`/customer-order/with-items-and-invoice/${uuid}`}
        reloadKey={reloadKey}
        heading={(d) =>
          d.customer_order.customer_company_name ||
          d.customer_order.customer_full_name ||
          t('customerOrders.noCustomer')
        }
        subheading={(d) => {
          const o = d.customer_order;
          return (
            <View style={styles.badges}>
              <ThemedText style={[styles.badge, o.is_fulfilled ? styles.ok : styles.pending]}>
                {o.is_fulfilled ? t('customerOrders.fulfilled') : t('customerOrders.unfulfilled')}
              </ThemedText>
              <ThemedText style={[styles.badge, o.is_paid ? styles.ok : styles.due]}>
                {o.is_paid ? t('customerOrders.paid') : t('customerOrders.unpaid')}
              </ThemedText>
              {o.is_overdue && (
                <ThemedText style={[styles.badge, styles.overdue]}>
                  {t('customerOrders.overdue')}
                </ThemedText>
              )}
            </View>
          );
        }}
        rows={(d): DetailRow[] => {
          const o = d.customer_order;
          return [
            [t('customerOrders.total'), money(o.total_adjusted_amount, o.currency)],
            [t('customerOrders.paidAmount'), money(o.net_amount_paid, o.currency)],
            [t('customerOrders.due'), money(o.net_amount_due, o.currency)],
            [t('payments.received'), formatNumericDate(new Date(o.created_at))],
            [t('customerOrders.notes'), o.notes || '—'],
          ];
        }}
        sections={[
          {
            title: t('customerOrders.itemsTitle'),
            isEmpty: (d) => !liveItems(d.customer_order).length,
            emptyText: t('customerOrders.noItems'),
            render: (d) => (
              <>
                {liveItems(d.customer_order).map((it) => (
                  <View key={it.uuid} style={styles.line}>
                    <ThemedText style={styles.lineName} numberOfLines={1}>
                      {it.material_name || '—'}
                    </ThemedText>
                    <ThemedText style={styles.lineQty}>
                      {it.quantity}
                      {it.unit ? ` ${it.unit}` : ''}
                    </ThemedText>
                    {/* per-line, because an order is routinely part-delivered */}
                    <ThemedText
                      style={[styles.badge, it.is_fulfilled ? styles.ok : styles.pending]}
                    >
                      {it.is_fulfilled
                        ? t('customerOrders.fulfilled')
                        : t('customerOrders.unfulfilled')}
                    </ThemedText>
                    {!!it.is_fulfilled && (
                      <TouchableOpacity
                        onPress={() => unfulfil(it)}
                        hitSlop={8}
                        testID={`unfulfil-${it.uuid}`}
                      >
                        <ThemedText style={styles.unfulfil}>
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
                  .map((inv) => (
                    <View key={inv.uuid} style={styles.invoice}>
                      <View style={styles.invoiceTop}>
                        <ThemedText style={styles.invoiceAmount}>
                          {money(inv.net_amount_due, inv.currency)} {t('customerOrders.due')}
                        </ThemedText>
                        {!!inv.status && (
                          <ThemedText style={[styles.badge, styles.pending]}>
                            {tef(inv.status)}
                          </ThemedText>
                        )}
                        {inv.is_overdue && (
                          <ThemedText style={[styles.badge, styles.overdue]}>
                            {t('customerOrders.overdue')}
                          </ThemedText>
                        )}
                      </View>
                      <ThemedText style={styles.invoiceMeta}>
                        {t('customerOrders.paidAmount')} {money(inv.net_amount_paid, inv.currency)}
                        {inv.due_date ? ` · ${formatNumericDate(new Date(inv.due_date))}` : ''}
                      </ThemedText>
                      {(inv.invoice_items ?? [])
                        .filter((li) => !li.is_deleted)
                        .map((li) => (
                          <View key={li.uuid} style={styles.invoiceLine}>
                            <ThemedText style={styles.invoiceLineName} numberOfLines={1}>
                              {li.material_name || '—'}
                            </ThemedText>
                            <ThemedText style={styles.invoiceLineFigures}>
                              {li.quantity ?? '—'} × {money(li.price_per_unit, null)} ={' '}
                              {money(li.total_price, inv.currency)}
                            </ThemedText>
                          </View>
                        ))}
                      {/* per-invoice, so a second invoice on the order is payable
                          directly rather than only whichever happens to be first */}
                      {(inv.net_amount_due ?? 0) > 0.005 && (
                        <TouchableOpacity
                          style={styles.payBtn}
                          onPress={() => {
                            setReloadKey((k) => k + 1);
                            router.push({
                              pathname: '/distribution/order',
                              params: { orderUuid: uuid, invoiceUuid: inv.uuid },
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
                  ))}
              </>
            ),
          },
        ]}
        actions={[
          {
            label: t('customerOrders.fulfilAndPay'),
            testID: 'order-fulfil-pay',
            onPress: () => {
              setReloadKey((k) => k + 1);
              router.push({ pathname: '/distribution/order', params: { orderUuid: uuid } });
            },
          },
          {
            label: t('customerOrders.editNotes'),
            testID: 'order-edit-notes',
            onPress: (d) => {
              setNotesDraft(d.customer_order.notes ?? '');
              setNotesOpen(true);
            },
          },
          {
            label: t('detail.delete'),
            destructive: true,
            testID: 'order-delete',
            // the server refuses this cascade once the order is fulfilled, paid, or
            // has no live items (with a misleading message on the empty case) — so
            // only offer it where it can succeed
            visible: (d) =>
              !d.customer_order.is_fulfilled &&
              !d.customer_order.is_paid &&
              liveItems(d.customer_order).length > 0,
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

      <Modal
        visible={notesOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setNotesOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <ThemedText style={styles.modalTitle}>{t('customerOrders.editNotes')}</ThemedText>
            <TextInput
              style={styles.notesInput}
              value={notesDraft}
              onChangeText={setNotesDraft}
              placeholder={t('customerOrders.notesPlaceholder')}
              placeholderTextColor="#9ca3af"
              multiline
              autoFocus
              testID="order-notes-input"
            />
            <View style={styles.modalRow}>
              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setNotesOpen(false)}
                disabled={notesSaving}
              >
                <ThemedText style={styles.modalCancelText}>{t('common.cancel')}</ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSave, notesSaving && styles.modalSaveOff]}
                onPress={saveNotes}
                disabled={notesSaving}
                testID="order-notes-save"
              >
                <ThemedText style={styles.modalSaveText}>
                  {notesSaving ? t('custdetail.saving') : t('form.save')}
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  ok: { backgroundColor: '#dcfce7', color: '#166534' },
  pending: { backgroundColor: '#f3f4f6', color: '#4b5563' },
  due: { backgroundColor: '#fef3c7', color: '#92400e' },
  overdue: { backgroundColor: '#fee2e2', color: '#991b1b' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5 },
  lineName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1f2937' },
  lineQty: { fontSize: 14, opacity: 0.7 },
  unfulfil: { fontSize: 12, fontWeight: '700', color: '#dc2626' },
  invoice: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.07)',
  },
  invoiceTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  invoiceAmount: { flex: 1, fontSize: 14, fontWeight: '700', color: '#1f2937' },
  invoiceMeta: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  invoiceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    paddingLeft: 6,
  },
  invoiceLineName: { flex: 1, fontSize: 12, opacity: 0.75 },
  invoiceLineFigures: { fontSize: 12, opacity: 0.6 },
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
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  notesInput: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    minHeight: 90,
    textAlignVertical: 'top',
  },
  modalRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  modalCancel: { paddingHorizontal: 14, paddingVertical: 10 },
  modalCancelText: { color: '#6b7280', fontWeight: '600' },
  modalSave: {
    backgroundColor: '#5469D4',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  modalSaveOff: { opacity: 0.6 },
  modalSaveText: { color: '#fff', fontWeight: '700' },
});
