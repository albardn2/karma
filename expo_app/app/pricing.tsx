import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

interface Pricing {
  uuid: string;
  material_uuid: string;
  price_per_unit: number;
  currency: string;
  unit?: string | null;
}

interface Material {
  uuid: string;
  name?: string | null;
  sku?: string | null;
  measure_unit?: string | null;
}

/** The DTO ceiling. 101 is a 422, not a clamp. */
const PER_PAGE = 100;
/** Stop after this many pages so a huge catalogue cannot hang the screen. */
const MAX_PAGES = 6;

/**
 * The price list — what a material sells for.
 *
 * This is the one screen in the app a salesperson standing in a shop actually needs,
 * and until now they had none: distribution/create-order.tsx asks them to type a price
 * from memory. All four field roles (sales, sales_manager, sales_associate, driver)
 * hold pricing read, so unlike the dashboard this one reaches its audience.
 *
 * It is NOT a pricing engine. One row is (material, price, currency) — no customer
 * dimension, no tier, no price list, no effective or expiry date. The web page's
 * TypeScript claims material_name, material_sku, effective_date and expiry_date, and
 * the API returns none of them; that type is aspirational, so nothing here is built on
 * it.
 *
 * WHY THIS IS NOT A ModuleListScreen. A pricing row carries material_uuid and no name,
 * and PricingListParams has no name param — `?name=` is a 422. So the only way to offer
 * "type sugar, see the price" is to resolve names client-side and search over the
 * join. Server-side paging cannot do it, which is why the catalogue is pulled up to
 * MAX_PAGES and filtered here.
 */
export default function PricingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [rows, setRows] = useState<Pricing[] | null>(null);
  const [materials, setMaterials] = useState<Record<string, Material>>({});
  const [query, setQuery] = useState('');
  const [currency, setCurrency] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [truncated, setTruncated] = useState(false);

  /** Page through a list endpoint up to MAX_PAGES, returning what it got. */
  const drain = useCallback(async <T,>(path: string, key: string): Promise<[T[], boolean]> => {
    const out: T[] = [];
    let page = 1;
    let more = true;
    while (more && page <= MAX_PAGES) {
      const sep = path.includes('?') ? '&' : '?';
      const res = await apiCall<Record<string, any>>(
        `${path}${sep}page=${page}&per_page=${PER_PAGE}`,
      );
      if (!isOk(res.status)) throw new Error(String(res.status));
      const batch = (res.data?.[key] as T[]) ?? [];
      out.push(...batch);
      const pages = Number(res.data?.pages ?? 1);
      more = page < pages;
      page += 1;
    }
    return [out, more];
  }, []);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!isRefresh) setLoading(true);
      setFailed(false);
      try {
        const [[prices, pricesTruncated], [mats]] = await Promise.all([
          drain<Pricing>('/pricing/', 'pricings'),
          drain<Material>('/material/', 'materials'),
        ]);
        const byUuid: Record<string, Material> = {};
        for (const m of mats) byUuid[m.uuid] = m;
        setMaterials(byUuid);
        setRows(prices);
        setTruncated(pricesTruncated);
      } catch {
        setFailed(true);
        setRows([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [drain],
  );

  useEffect(() => {
    load();
  }, [load]);

  const currencies = useMemo(
    () => Array.from(new Set((rows ?? []).map((r) => r.currency).filter(Boolean))).sort(),
    [rows],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? [])
      .filter((r) => (currency ? r.currency === currency : true))
      .map((r) => {
        const m = materials[r.material_uuid];
        return {
          ...r,
          name: m?.name ?? t('inventory.unknownMaterial'),
          sku: m?.sku ?? '',
          shownUnit: r.unit || m?.measure_unit || '',
        };
      })
      .filter((r) => !q || r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, materials, query, currency, t]);

  const price = (n?: number | null) =>
    n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

  return (
    <ModuleGuard module="pricing">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="pricing-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('menu.pricing')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder={t('pricing.searchPlaceholder')}
            placeholderTextColor="#9ca3af"
            autoCorrect={false}
            testID="pricing-search"
          />
        </View>

        {currencies.length > 1 && (
          <View style={styles.chips}>
            <TouchableOpacity
              style={[styles.chip, !currency && styles.chipOn]}
              onPress={() => setCurrency(null)}
              testID="pricing-currency-all"
            >
              <ThemedText style={[styles.chipText, !currency && styles.chipTextOn]}>
                {t('moduleList.all')}
              </ThemedText>
            </TouchableOpacity>
            {currencies.map((c) => (
              <TouchableOpacity
                key={c}
                style={[styles.chip, currency === c && styles.chipOn]}
                onPress={() => setCurrency(c)}
                testID={`pricing-currency-${c}`}
              >
                <ThemedText style={[styles.chipText, currency === c && styles.chipTextOn]}>
                  {c}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {loading ? (
          <View style={styles.centre}>
            <ActivityIndicator size="large" color="#5469D4" />
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: 40 + insets.bottom }]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load(true);
                }}
              />
            }
          >
            {failed ? (
              <View style={styles.centre}>
                <ThemedText style={styles.stateText} testID="pricing-error">
                  {t('moduleList.failed')}
                </ThemedText>
                <TouchableOpacity style={styles.retry} onPress={() => load()}>
                  <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
                </TouchableOpacity>
              </View>
            ) : !shown.length ? (
              <View style={styles.centre}>
                <ThemedText style={styles.stateText}>
                  {query ? t('moduleList.noMatches') : t('pricing.empty')}
                </ThemedText>
              </View>
            ) : (
              <>
                <ThemedText style={styles.count}>
                  {t('moduleList.count', { count: shown.length })}
                </ThemedText>
                <View style={styles.card}>
                  {shown.map((r) => (
                    <View key={r.uuid} style={styles.row} testID={`price-${r.uuid}`}>
                      <View style={styles.rowLeft}>
                        <ThemedText style={styles.name} numberOfLines={1}>
                          {r.name}
                        </ThemedText>
                        {!!r.sku && <ThemedText style={styles.sku}>{r.sku}</ThemedText>}
                      </View>
                      <ThemedText style={styles.price}>
                        {price(r.price_per_unit)} {r.currency}
                        {r.shownUnit ? (
                          <ThemedText style={styles.per}>{` / ${r.shownUnit}`}</ThemedText>
                        ) : null}
                      </ThemedText>
                    </View>
                  ))}
                </View>
                {truncated && (
                  <ThemedText style={styles.note}>
                    {t('pricing.truncated', { shown: MAX_PAGES * PER_PAGE })}
                  </ThemedText>
                )}
              </>
            )}
          </ScrollView>
        )}
      </ThemedView>
    </ModuleGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  searchWrap: { paddingHorizontal: 20, paddingBottom: 8 },
  search: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  chipOn: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextOn: { color: '#fff' },
  body: { paddingHorizontal: 20 },
  count: { fontSize: 12, opacity: 0.55, marginBottom: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  rowLeft: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  sku: { fontSize: 11, opacity: 0.5, marginTop: 1 },
  price: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  per: { fontSize: 12, fontWeight: '500', opacity: 0.55 },
  note: { fontSize: 11, opacity: 0.5, marginTop: 10 },
  centre: { alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  stateText: { fontSize: 14, opacity: 0.6, textAlign: 'center' },
  retry: {
    backgroundColor: '#5469D4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
});
