import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useLanguage } from '@/contexts/LanguageContext';
import { money } from '@/utils/money';

interface Pricing {
  uuid: string;
  material_uuid: string;
  material_name?: string | null;
  material_sku?: string | null;
  price_per_unit: number;
  currency: string;
  unit?: string | null;
}

/** The currencies the pricing DTO accepts; anything else 422s the list. */
const CURRENCIES = ['SYP', 'USD'];

/**
 * The price list — what a material sells for.
 *
 * All four field roles (sales, sales_manager, sales_associate, driver) hold pricing
 * read, so a salesperson in a shop can look a price up here.
 *
 * It is NOT a pricing engine. One row is (material, price, currency) — no customer
 * dimension, no tier, no effective or expiry date.
 *
 * Paged and searched server-side: each row carries its material's name and SKU, and
 * `material_query` searches name and SKU, so a catalogue of any size is reachable.
 */
export default function PricingScreen() {
  const router = useRouter();
  const { t } = useLanguage();

  return (
    <View style={styles.root}>
      <ModuleListScreen<Pricing>
        module="pricing"
        title={t('menu.pricing')}
        endpoint="/pricing/"
        itemsKey="pricings"
        searchParam="material_query"
        searchPlaceholder={t('pricing.searchPlaceholder')}
        filters={CURRENCIES.map((c) => ({ id: c, label: c, params: { currency: c } }))}
        keyExtractor={(r) => r.uuid}
        renderItem={(r) => (
          <View style={styles.row} testID={`price-${r.uuid}`}>
            <View style={styles.rowLeft}>
              <ThemedText style={styles.name} numberOfLines={1}>
                {r.material_name || t('inventory.unknownMaterial')}
              </ThemedText>
              {!!r.material_sku && <ThemedText style={styles.sku}>{r.material_sku}</ThemedText>}
            </View>
            <ThemedText style={styles.price}>
              {money(r.price_per_unit, r.currency)}
              {r.unit ? <ThemedText style={styles.per}>{` / ${r.unit}`}</ThemedText> : null}
            </ThemedText>
          </View>
        )}
      />
      <BottomNavigation activeTab="menu" onTabPress={() => router.replace('/(tabs)?tab=menu')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  rowLeft: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  sku: { fontSize: 11, opacity: 0.5, marginTop: 1 },
  price: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  per: { fontSize: 12, fontWeight: '500', opacity: 0.55 },
});
