import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { BottomSheetModal } from '@/components/BottomSheetModal';
import { ThemedText } from '@/components/ThemedText';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, apiErrorText } from '@/utils/api';

/** The API's refusal codes that have their own message in the app. */
const REFUSAL_MESSAGE_KEY: Record<string, string> = {
  wrong_password: 'deleteAccount.wrongPassword',
  not_admin: 'deleteAccount.notAdmin',
  platform_owner: 'deleteAccount.platformOwner',
};

/**
 * Lets a company admin delete their company from inside the app, as App Store
 * guideline 5.1.1(v) requires of an app that offers sign-up.
 *
 * DELETE /auth/account soft-deletes the company: every one of its users is then
 * refused at sign-in and signed out on their next request, and its records are
 * kept. The admin re-enters their password to confirm, and is signed out here
 * once it is done.
 */
export function DeleteAccountButton() {
  const { logout } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  const close = () => {
    setOpen(false);
    setPassword('');
  };

  const confirmDelete = async () => {
    if (!password) return;
    setDeleting(true);
    const res = await apiCall<{ msg: string }>('/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
    setDeleting(false);
    if (res.status === 200) {
      close();
      Alert.alert(t('deleteAccount.doneTitle'), t('deleteAccount.doneMessage'), [
        { text: t('common.ok'), onPress: () => { void logout(); } },
      ]);
      return;
    }
    Alert.alert(t('deleteAccount.failedTitle'), refusalMessage(res.error));
  };

  const refusalMessage = (error: string | undefined) => {
    try {
      const key = REFUSAL_MESSAGE_KEY[JSON.parse(error ?? '')?.code];
      if (key) return t(key);
    } catch {
      // not JSON: fall through to the server's text
    }
    return apiErrorText(error, t('deleteAccount.failedMessage'));
  };

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setOpen(true)} testID="button-delete-account">
        <ThemedText style={styles.triggerText}>{t('deleteAccount.button')}</ThemedText>
      </TouchableOpacity>

      <BottomSheetModal visible={open} onClose={close} title={t('deleteAccount.title')} busy={deleting}>
        <ThemedText style={styles.warning}>{t('deleteAccount.warning')}</ThemedText>
        <ThemedText style={styles.label}>{t('deleteAccount.passwordLabel')}</ThemedText>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder={t('deleteAccount.passwordPlaceholder')}
          placeholderTextColor="#9CA3AF"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="password"
          autoComplete="current-password"
          editable={!deleting}
          testID="delete-account-password"
        />
        <View style={styles.row}>
          <TouchableOpacity style={styles.cancel} onPress={close} disabled={deleting}>
            <ThemedText style={styles.cancelText}>{t('common.cancel')}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.delete, (!password || deleting) && styles.deleteOff]}
            onPress={confirmDelete}
            disabled={!password || deleting}
            testID="delete-account-confirm"
          >
            {deleting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.deleteText}>{t('deleteAccount.confirm')}</ThemedText>
            )}
          </TouchableOpacity>
        </View>
      </BottomSheetModal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { marginTop: 24, paddingVertical: 12, alignItems: 'center', alignSelf: 'stretch' },
  triggerText: { fontSize: 15, fontWeight: '600', color: '#DC2626' },
  warning: { fontSize: 14, lineHeight: 20, color: '#374151', marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
  },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  cancel: { paddingHorizontal: 14, paddingVertical: 10 },
  cancelText: { color: '#6b7280', fontWeight: '600' },
  delete: { backgroundColor: '#DC2626', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, minWidth: 90, alignItems: 'center' },
  deleteOff: { opacity: 0.5 },
  deleteText: { color: '#fff', fontWeight: '700' },
});
