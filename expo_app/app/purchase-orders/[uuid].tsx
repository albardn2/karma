import React, { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useHasModule } from '@/hooks/useModuleAccess';
import { formatNumericDate } from '@/utils/date';

const money = (n?: number | null, c?: string | null) =>
  n == null ? '—' : `${Number(n).toFixed(2)}${c ? ` ${c}` : ''}`;

interface PurchaseOrderItem {
  uuid: string;
  material_uuid?: string | null;
  material_name?: string | null;
  quantity?: number | null;
  unit?: string | null;
  price_per_unit?: number | null;
  is_fulfilled?: boolean | null;
}

interface PurchaseOrder {
  uuid: string;
  vendor_name?: string | null;
  status?: string | null;
  currency?: string | null;
  total_adjusted_amount?: number | null;
  net_amount_due?: number | null;
  is_overdue?: boolean | null;
  created_at: string;
  /** lines come back on the record itself under this key */
  purchase_order_items?: PurchaseOrderItem[] | null;
}

/**
 * A purchase order, its lines, and receiving them.
 *
 * The lines arrive on the record under `purchase_order_items`, so no second request
 * is needed to list them — but `is_fulfilled` per line is what makes a receive action
 * meaningful, and that is only visible here.
 *
 * Receiving is per line and always the full ordered quantity; there is no partial
 * receipt and no unfulfil worth offering (unfulfill-items returns an empty array in
 * practice, so a toggle would silently do nothing).
 */
export default function PurchaseOrdersDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t, tef } = useLanguage();
  const router = useRouter();
  const [reloadKey, setReloadKey] = useState(0);
  const canReceive = useHasModule('inventory');

  const qty = (n?: number | null) =>
    n == null ? '—' : Number.isInteger(n) ? String(n) : Number(n).toFixed(2);

  return (
    <ModuleDetailScreen<PurchaseOrder>
      module="purchase-orders"
      title={t('menu.purchaseOrders')}
      endpoint={`/purchase-order/${uuid}`}
      reloadKey={reloadKey}
      heading={(x) => x.vendor_name || t('purchaseOrders.noVendor')}
      rows={(x): DetailRow[] => [
        [t('purchaseOrders.total'), money(x.total_adjusted_amount, x.currency)],
        [t('purchaseOrders.outstanding'), money(x.net_amount_due, x.currency)],
        [t('purchaseOrders.status'), x.status ? tef(x.status) : '—'],
        [t('purchaseOrders.when'), formatNumericDate(new Date(x.created_at))],
      ]}
      sections={[
        {
          title: t('purchaseOrders.lines'),
          isEmpty: (x) => !x.purchase_order_items?.length,
          emptyText: t('purchaseOrders.noLines'),
          render: (x) => (
            <>
              {(x.purchase_order_items ?? []).map((li) => (
                <View key={li.uuid} style={styles.line}>
                  <View style={styles.lineLeft}>
                    <ThemedText style={styles.lineName} numberOfLines={1}>
                      {li.material_name ?? '—'}
                    </ThemedText>
                    <ThemedText style={styles.lineMeta}>
                      {qty(li.quantity)}
                      {li.unit ? ` ${li.unit}` : ''}
                      {li.price_per_unit != null
                        ? ` · ${money(li.price_per_unit, x.currency)}`
                        : ''}
                    </ThemedText>
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
            </>
          ),
        },
      ]}
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
  receive: {
    backgroundColor: '#5469D4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  receiveText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
