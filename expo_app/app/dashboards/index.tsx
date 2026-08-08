import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface Entry {
  id: string;
  route: string;
  icon: string;
  titleKey: string;
  descKey: string;
}

/**
 * Dashboards implemented in the app, in catalog order (mirrors the web
 * lib/dashboards.ts and the backend DASHBOARD_CATALOG ids). business-overview is the
 * existing overview screen; the hub renders the intersection of this list with the
 * role's assignment, so an id assigned but not yet built simply doesn't appear.
 */
const IMPLEMENTED: Entry[] = [
  {
    id: 'business-overview',
    route: '/dashboard',
    icon: '📈',
    titleKey: 'dashboards.businessOverview',
    descKey: 'dashboards.businessOverviewDesc',
  },
  {
    id: 'profitability',
    route: '/dashboards/profitability',
    icon: '📊',
    titleKey: 'dashboards.profitability',
    descKey: 'dashboards.profitabilityDesc',
  },
];

/**
 * The dashboards hub: the pre-defined set of reports assigned to this user's role.
 *
 * Assignment is resolved server-side and arrives on /auth/me as `dashboards` — a list
 * of ids, or null for admins who see all, the same null-means-all rule the module
 * gate uses. This is the app mirror of the web hub, so a role sees the same set in
 * both clients.
 */
export default function DashboardsHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { t } = useLanguage();

  const assigned: string[] | null | undefined = (user as any)?.dashboards;
  const entries = assigned ? IMPLEMENTED.filter((d) => assigned.includes(d.id)) : IMPLEMENTED;

  return (
    <ModuleGuard module="dashboard">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="dashboards-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle}>{t('dashboards.hubTitle')}</ThemedText>
          <View style={styles.backSpacer} />
        </View>

        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 40 + insets.bottom }]}>
          <ThemedText style={styles.subtitle}>{t('dashboards.hubSubtitle')}</ThemedText>

          {entries.length === 0 ? (
            <View style={styles.centre}>
              <ThemedText style={styles.stateText} testID="dashboards-empty">
                {t('dashboards.none')}
              </ThemedText>
            </View>
          ) : (
            entries.map((d) => (
              <TouchableOpacity
                key={d.id}
                style={styles.card}
                activeOpacity={0.7}
                onPress={() => router.push(d.route as never)}
                testID={`dashboard-card-${d.id}`}
              >
                <View style={styles.iconBadge}>
                  <ThemedText style={styles.iconText}>{d.icon}</ThemedText>
                </View>
                <View style={styles.cardBody}>
                  <ThemedText style={styles.cardTitle}>{t(d.titleKey)}</ThemedText>
                  <ThemedText style={styles.cardDesc}>{t(d.descKey)}</ThemedText>
                </View>
                <ThemedText style={styles.chevron}>›</ThemedText>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
        <BottomNavigation activeTab="menu" onTabPress={() => router.replace('/(tabs)?tab=menu')} />
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
  body: { paddingHorizontal: 20, paddingTop: 6 },
  subtitle: { fontSize: 13, color: '#6B7280', marginBottom: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    gap: 14,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#eef2ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: { fontSize: 20 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  cardDesc: { fontSize: 12, color: '#6B7280', marginTop: 2, lineHeight: 17 },
  chevron: { fontSize: 26, color: '#9ca3af', fontWeight: '400' },
  centre: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  stateText: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
});
