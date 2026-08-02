import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumericDate } from '@/utils/date';

interface InventoryLot {
  uuid: string;
  lot_id: string;
  material_name?: string | null;
  unit?: string | null;
  current_quantity: number;
  original_quantity: number;
  expiration_date?: string | null;
  is_active: boolean;
}

/** A lot at or below zero is the thing a warehouse keeper needs to see first. */
const isDepleted = (lot: InventoryLot) => Number(lot.current_quantity ?? 0) <= 0;

/**
 * Whether a lot is past its expiry, or close enough to matter.
 *
 * Compared date-only. expiration_date arrives as a naive timestamp, and a lot that
 * expires today should read as expiring today rather than flipping on the hour the
 * timestamp happens to carry.
 */
const EXPIRY_SOON_DAYS = 30;
function expiryState(iso?: string | null): 'none' | 'soon' | 'expired' {
  if (!iso) return 'none';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'none';
  const today = new Date();
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(
    (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) -
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / day,
  );
  if (days < 0) return 'expired';
  return days <= EXPIRY_SOON_DAYS ? 'soon' : 'none';
}

/**
 * Stock on hand, by lot.
 *
 * This is the module `warehouse_keeper` actually has permissions for — that role
 * had a preset granting stock and nothing in the app to use it with, so its menu
 * was empty. This is its first real screen.
 *
 * Quantity is shown against the original rather than alone, because "40 kg" means
 * something different on a lot that started at 50 than on one that started at
 * 1,000, and a keeper deciding whether to reorder needs the second number.
 */
export default function InventoryScreen() {
  const router = useRouter();
  const { t } = useLanguage();

  const qty = (n: number) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(2));

  return (
    <View style={styles.root}>
      <ModuleListScreen<InventoryLot>
        module="inventory"
        title={t('menu.inventory')}
        endpoint="/inventory/"
        itemsKey="inventories"
        filters={[
          // The only status filter the endpoint takes. material_name is on the row
          // but is NOT a filter — passing it 422s the request, same trap as orders.
          { id: 'active', label: t('inventory.active'), params: { is_active: 'true' } },
          { id: 'inactive', label: t('inventory.inactive'), params: { is_active: 'false' } },
        ]}
        keyExtractor={(l) => l.uuid}
        renderItem={(l) => {
          const expiry = expiryState(l.expiration_date);
          const depleted = isDepleted(l);
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => router.push(`/inventory/${l.uuid}`)}
              testID={`lot-${l.uuid}`}
            >
              <View style={styles.cardTop}>
                <ThemedText style={styles.material} numberOfLines={1}>
                  {l.material_name || t('inventory.unknownMaterial')}
                </ThemedText>
                <ThemedText style={[styles.qty, depleted && styles.qtyDepleted]}>
                  {qty(l.current_quantity)}
                  {l.unit ? ` ${l.unit}` : ''}
                </ThemedText>
              </View>

              <View style={styles.cardBottom}>
                <ThemedText style={styles.lot} numberOfLines={1}>
                  {l.lot_id}
                </ThemedText>
                <View style={styles.badges}>
                  <ThemedText style={styles.ofOriginal}>
                    {t('inventory.ofOriginal', { original: qty(l.original_quantity) })}
                  </ThemedText>
                  {depleted && (
                    <ThemedText style={[styles.badge, styles.badgeDepleted]}>
                      {t('inventory.depleted')}
                    </ThemedText>
                  )}
                  {expiry === 'expired' && (
                    <ThemedText style={[styles.badge, styles.badgeExpired]}>
                      {t('inventory.expired')}
                    </ThemedText>
                  )}
                  {expiry === 'soon' && (
                    <ThemedText style={[styles.badge, styles.badgeSoon]}>
                      {t('inventory.expiringSoon')}
                    </ThemedText>
                  )}
                  {!l.is_active && (
                    <ThemedText style={[styles.badge, styles.badgeInactive]}>
                      {t('inventory.inactive')}
                    </ThemedText>
                  )}
                </View>
              </View>

              {l.expiration_date && expiry !== 'none' && (
                <ThemedText style={styles.expiryLine}>
                  {t('inventory.expires', {
                    date: formatNumericDate(new Date(l.expiration_date)),
                  })}
                </ThemedText>
              )}
            </TouchableOpacity>
          );
        }}
      />
      <BottomNavigation activeTab="menu" onTabPress={() => router.replace('/(tabs)?tab=menu')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  material: { flex: 1, fontSize: 16, fontWeight: '600', color: '#1f2937' },
  qty: { fontSize: 16, fontWeight: '700', color: '#1f2937' },
  qtyDepleted: { color: '#991b1b' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  lot: { flex: 1, fontSize: 12, opacity: 0.5 },
  ofOriginal: { fontSize: 12, opacity: 0.55 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', justifyContent: 'flex-end' },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  badgeDepleted: { backgroundColor: '#fee2e2', color: '#991b1b' },
  badgeExpired: { backgroundColor: '#fee2e2', color: '#991b1b' },
  badgeSoon: { backgroundColor: '#fef3c7', color: '#92400e' },
  badgeInactive: { backgroundColor: '#f3f4f6', color: '#4b5563' },
  expiryLine: { fontSize: 12, opacity: 0.6, marginTop: 8 },
});
