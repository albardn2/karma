import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { useHasModule } from '@/hooks/useModuleAccess';

interface ModuleGuardProps {
  /** menu-module id this screen belongs to, matching the backend MODULES registry */
  module: string;
  children: React.ReactNode;
}

/**
 * Refuse a module screen to a user whose permissions do not include it.
 *
 * Hiding the tile is not access control. Every module screen is a sibling route on
 * the root Stack, so `myapp://customer-orders` opens it directly whether or not the
 * tile was rendered — and while the API still rejects the requests, the user lands
 * on a screen that looks like theirs and fails piecemeal, which reads as breakage
 * rather than as a permission boundary.
 *
 * This is the honest answer instead, and it is deliberately the SAME source of truth
 * the menu filters on, so a hidden tile and a blocked route can never disagree.
 *
 * It is not a substitute for the server-side gate — a client cannot be trusted with
 * authorization — it is the UI telling the truth about a decision the server has
 * already made.
 */
export function ModuleGuard({ module, children }: ModuleGuardProps) {
  const allowed = useHasModule(module);
  const { t } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  if (allowed) return <>{children}</>;

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.body}>
        <ThemedText style={styles.icon}>🔒</ThemedText>
        <ThemedText style={styles.title} testID="module-denied-title">
          {t('moduleDenied.title')}
        </ThemedText>
        <ThemedText style={styles.message}>{t('moduleDenied.message')}</ThemedText>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/(tabs)?tab=menu')}
          testID="module-denied-back"
        >
          <ThemedText style={styles.buttonText}>{t('moduleDenied.back')}</ThemedText>
        </TouchableOpacity>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  icon: { fontSize: 44 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  message: {
    fontSize: 15,
    opacity: 0.65,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#5469D4',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
