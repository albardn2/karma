import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';

interface Entry {
  route: string;
  titleKey: string;
  blurbKey: string;
  icon: string;
}

/**
 * The four sections of the web console, in the order it presents them.
 *
 * Kept as data so the hub and the routes cannot drift: every entry is a real file under
 * app/super-admin/, and the route deriving from it is the file name.
 */
const ENTRIES: Entry[] = [
  {
    route: '/super-admin/accounts',
    titleKey: 'superAdmin.tabAccounts',
    blurbKey: 'superAdmin.tabAccountsBlurb',
    icon: '🏢',
  },
  {
    route: '/super-admin/tracking',
    titleKey: 'superAdmin.tabTracking',
    blurbKey: 'superAdmin.tabTrackingBlurb',
    icon: '📍',
  },
  {
    route: '/super-admin/workflows',
    titleKey: 'superAdmin.tabWorkflows',
    blurbKey: 'superAdmin.tabWorkflowsBlurb',
    icon: '🔀',
  },
  {
    route: '/super-admin/roles',
    titleKey: 'superAdmin.tabRoles',
    blurbKey: 'superAdmin.tabRolesBlurb',
    icon: '🔐',
  },
];

/**
 * The platform console: a hub, not a tab bar.
 *
 * The web version is four tabs across the top, which is right at desktop width. On a
 * phone it is not: two of the four labels are long ("Location tracking", "Role presets")
 * and in Arabic they are longer still, so a four-tab strip either truncates or wraps into
 * something that competes with the content underneath.
 *
 * It also fights the components. Each section is a ModuleListScreen or a ModuleForm, and
 * those own their own header, search and filter chips — a tab bar above them would either
 * scroll away with the content or need every screen restructured to give up its header.
 * A hub costs one extra tap and keeps each section exactly the shape the rest of the app
 * already uses.
 *
 * Gated on the `superuser` scope rather than a module, like the sections it links to: the
 * platform console has no MODULES entry because it is not a tenant feature an account
 * could be granted.
 */
export default function SuperAdminHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  return (
    <ModuleGuard requireScope="superuser">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="super-admin-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('menu.superAdmin')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 32 + insets.bottom }]}>
          <ThemedText style={styles.subtitle}>{t('superAdmin.hubSubtitle')}</ThemedText>
          {ENTRIES.map((e) => (
            <TouchableOpacity
              key={e.route}
              style={styles.card}
              onPress={() => router.push(e.route as never)}
              testID={`super-admin-${e.route.split('/').pop()}`}
            >
              <ThemedText style={styles.icon}>{e.icon}</ThemedText>
              <View style={styles.cardText}>
                <ThemedText style={styles.cardTitle}>{t(e.titleKey)}</ThemedText>
                <ThemedText style={styles.cardBlurb}>{t(e.blurbKey)}</ThemedText>
              </View>
              <ThemedText style={styles.chevron}>›</ThemedText>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
  body: { paddingHorizontal: 20, paddingTop: 4, gap: 12 },
  subtitle: { fontSize: 13, opacity: 0.6, marginBottom: 4, lineHeight: 19 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  icon: { fontSize: 24 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#1f2937' },
  cardBlurb: { fontSize: 12, opacity: 0.6, marginTop: 2, lineHeight: 17 },
  chevron: { fontSize: 24, lineHeight: 28, color: '#9ca3af', fontWeight: '600' },
});
