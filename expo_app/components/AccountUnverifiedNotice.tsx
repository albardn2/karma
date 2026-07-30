import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

/**
 * What a company sees in the app before a platform owner has verified it.
 *
 * Lives under components/, NOT under app/ — anything in app/ becomes a route,
 * and this must never be navigable.
 *
 * It replaces the whole navigator (see app/_layout.tsx) rather than redirecting,
 * so no module screen mounts and none of their fetch-on-mount effects fire. The
 * backend independently refuses every resource endpoint with 403
 * `account_unverified`, so this screen is the explanation, not the boundary.
 *
 * Logout has to be here. The app's only logout control is a row inside the tabs
 * screen, which this gate stops rendering — without it the user is stuck and
 * would have to clear the app's data to sign in as anyone else.
 */
export function AccountUnverifiedNotice() {
  const { user, logout, refreshUser } = useAuth();
  const { t } = useLanguage();
  const [checking, setChecking] = useState(false);
  const company = user?.account_company_name as string | undefined;

  const recheck = async () => {
    setChecking(true);
    try {
      await refreshUser();
    } finally {
      setChecking(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert(t('menu.logout'), t('menu.logoutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('menu.logout'), style: 'destructive', onPress: () => { void logout(); } },
    ]);
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.badge}>
        <ThemedText style={styles.badgeIcon}>!</ThemedText>
      </View>

      <ThemedText style={styles.title} testID="unverified-title">
        {t('unverified.title')}
      </ThemedText>
      <ThemedText style={styles.body}>{t('unverified.body')}</ThemedText>
      <ThemedText style={styles.contact}>{t('unverified.contact')}</ThemedText>

      {(company || user?.username) && (
        <View style={styles.details}>
          {!!company && (
            <ThemedText style={styles.detailLine}>
              {t('unverified.company')}: {company}
            </ThemedText>
          )}
          {!!user?.username && (
            <ThemedText style={styles.detailLine}>
              {t('unverified.signedInAs')}: {user.username}
            </ThemedText>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryBtn, checking && styles.btnBusy]}
        onPress={recheck}
        disabled={checking}
        testID="button-unverified-recheck"
      >
        {checking ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <ThemedText style={styles.primaryBtnText}>{t('unverified.recheck')}</ThemedText>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryBtn} onPress={confirmLogout} testID="button-unverified-logout">
        <ThemedText style={styles.secondaryBtnText}>{t('menu.logout')}</ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  // Direction-agnostic on purpose: `textAlign: 'left'` is literal under
  // I18nManager.forceRTL, so an Arabic user would get text hugging the wrong
  // edge. Centred works in both directions without a conditional.
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28 },
  badge: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEF3C7',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  badgeIcon: { fontSize: 28, fontWeight: '800', color: '#D97706', lineHeight: 32 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 15, opacity: 0.7, textAlign: 'center', lineHeight: 22 },
  contact: { fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 22, marginTop: 10 },
  details: {
    marginTop: 22, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.04)', alignSelf: 'stretch',
  },
  detailLine: { fontSize: 13, opacity: 0.7, textAlign: 'center', lineHeight: 20 },
  primaryBtn: {
    marginTop: 28, alignSelf: 'stretch', backgroundColor: '#5469D4',
    borderRadius: 12, paddingVertical: 15, alignItems: 'center',
  },
  btnBusy: { opacity: 0.7 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center', alignSelf: 'stretch' },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: '#DC2626' },
});
