import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumericDate } from '@/utils/date';

interface InventoryEvent {
  uuid: string;
  event_type?: string | null;
  material_name?: string | null;
  quantity: number;
  created_at: string;
  notes?: string | null;
}

/**
 * Stock movements — why the numbers on the inventory screen changed.
 *
 * quantity is SIGNED: a sale records -1, a purchase order +10. That sign is the
 * whole content of a row, so it is rendered explicitly with a leading + and
 * coloured, rather than shown as a bare number that reads as a quantity on hand.
 *
 * Chips cover the event types that actually occur in the data (sale, process,
 * purchase order, manual). The enum has three more — transfer, return, adjustment —
 * deliberately left off: seven chips do not fit a phone, and a filter that always
 * returns nothing is worse than no filter.
 */
export default function InventoryEventsScreen() {
  const router = useRouter();
  const { t, tef } = useLanguage();

  return (
    <View style={styles.root}>
      <ModuleListScreen<InventoryEvent>
        module="inventory-events"
        title={t('menu.inventoryEvents')}
        endpoint="/inventory-event/"
        itemsKey="events"
        filters={[
          { id: 'sale', label: tef('sale'), params: { event_type: 'sale' } },
          { id: 'po', label: tef('purchase_order'), params: { event_type: 'purchase_order' } },
          { id: 'process', label: tef('process'), params: { event_type: 'process' } },
          { id: 'manual', label: tef('manual'), params: { event_type: 'manual' } },
        ]}
        keyExtractor={(e) => e.uuid}
        renderItem={(e) => {
          const out = Number(e.quantity ?? 0) < 0;
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => router.push(`/inventory-events/${e.uuid}`)}
              testID={`event-${e.uuid}`}
            >
              <View style={styles.cardTop}>
                <ThemedText style={styles.material} numberOfLines={1}>
                  {e.material_name || t('inventory.unknownMaterial')}
                </ThemedText>
                <ThemedText style={[styles.qty, out ? styles.qtyOut : styles.qtyIn]}>
                  {out ? '' : '+'}
                  {Number(e.quantity ?? 0)}
                </ThemedText>
              </View>
              <View style={styles.cardBottom}>
                <ThemedText style={styles.date}>
                  {formatNumericDate(new Date(e.created_at))}
                </ThemedText>
                {!!e.event_type && (
                  <ThemedText style={styles.type}>{tef(e.event_type)}</ThemedText>
                )}
              </View>
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
  qty: { fontSize: 16, fontWeight: '700' },
  qtyIn: { color: '#166534' },
  qtyOut: { color: '#991b1b' },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  date: { fontSize: 13, opacity: 0.55 },
  type: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4b5563',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
