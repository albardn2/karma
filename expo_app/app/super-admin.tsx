import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleListScreen } from '@/components/ModuleListScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumericDate } from '@/utils/date';

interface Account {
  uuid: string;
  company_name?: string | null;
  email?: string | null;
  is_blocked?: boolean | null;
  is_verified?: boolean | null;
  user_count?: number | null;
  subscription_type?: string | null;
  subscription_rate?: number | null;
  subscription_currency?: string | null;
  /** per-currency, and never combined */
  balances?: Record<string, number> | null;
  created_at: string;
}

/**
 * The tenants on the platform.
 *
 * Gated on the `superuser` SCOPE rather than a module, because the platform-owner
 * console has no entry in the MODULES registry — it is not a tenant feature that an
 * account could be granted, so there is no module id to key on. The routes are
 * superuser-only server-side and the client gate matches that.
 *
 * The envelope's page count is `total_pages` here, not `pages` as everywhere else.
 * Reading the wrong one fails silently — it defaults to 1, so the list looks complete
 * while hiding every account after the first page — which is why ModuleListScreen now
 * takes the field name.
 *
 * The rows lead with the two states a platform owner actually scans for: an unverified
 * account is waiting on them, and a blocked one is cut off. Everything else is context.
 */
export default function SuperAdminScreen() {
  const router = useRouter();
  const { t, tef } = useLanguage();

  const money = (b?: Record<string, number> | null) => {
    const entries = Object.entries(b ?? {}).filter(([, v]) => Number(v) !== 0);
    if (!entries.length) return null;
    // one figure per currency; adding SYP to USD would be meaningless
    return entries.map(([cur, v]) => `${Number(v).toFixed(2)} ${cur}`).join(' · ');
  };

  return (
    <ModuleListScreen<Account>
      requireScope="superuser"
      title={t('menu.superAdmin')}
      endpoint="/super-admin/accounts"
      itemsKey="accounts"
      pagesKey="total_pages"
      keyExtractor={(a) => a.uuid}
      renderItem={(a) => {
        const bal = money(a.balances);
        return (
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push(`/super-admin/${a.uuid}` as never)}
            testID={`account-${a.uuid}`}
          >
            <View style={styles.rowLeft}>
              <ThemedText style={styles.name} numberOfLines={1}>
                {a.company_name || t('superAdmin.unnamed')}
              </ThemedText>
              <ThemedText style={styles.meta} numberOfLines={1}>
                {t('superAdmin.users', { n: a.user_count ?? 0 })}
                {a.subscription_type ? ` · ${tef(a.subscription_type)}` : ''}
                {bal ? ` · ${bal}` : ''}
              </ThemedText>
            </View>
            <View style={styles.tags}>
              {a.is_blocked ? (
                <ThemedText style={[styles.tag, styles.blocked]}>
                  {t('superAdmin.blocked')}
                </ThemedText>
              ) : !a.is_verified ? (
                <ThemedText style={[styles.tag, styles.pending]}>
                  {t('superAdmin.pending')}
                </ThemedText>
              ) : (
                <ThemedText style={styles.when}>
                  {a.created_at ? formatNumericDate(new Date(a.created_at)) : ''}
                </ThemedText>
              )}
            </View>
          </TouchableOpacity>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  rowLeft: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#1f2937' },
  meta: { fontSize: 12, opacity: 0.55, marginTop: 2 },
  tags: { alignItems: 'flex-end' },
  tag: { fontSize: 11, fontWeight: '700', overflow: 'hidden', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  blocked: { color: '#991b1b', backgroundColor: '#fee2e2' },
  pending: { color: '#92400e', backgroundColor: '#fef3c7' },
  when: { fontSize: 11, opacity: 0.5 },
});
