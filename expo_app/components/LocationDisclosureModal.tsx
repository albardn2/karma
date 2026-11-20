import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { useLanguage } from '@/contexts/LanguageContext';

export interface LocationDisclosureHandle {
  /** Show the disclosure; resolves true when the user continues to the system prompt. */
  ask: () => Promise<boolean>;
}

/**
 * The prominent disclosure Google Play requires before an app asks for
 * background location: what is collected, for which feature, and that it
 * continues while the app is closed.
 *
 * Driven imperatively so its visibility state re-renders only this modal, not
 * the tree under LocationTrackingProvider that hosts it.
 */
export const LocationDisclosureModal = forwardRef<LocationDisclosureHandle>(function LocationDisclosureModal(_props, ref) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const resolveRef = useRef<((accepted: boolean) => void) | null>(null);

  useImperativeHandle(ref, () => ({
    ask: () =>
      new Promise<boolean>((resolve) => {
        resolveRef.current?.(false);
        resolveRef.current = resolve;
        setVisible(true);
      }),
  }));

  const answer = (accepted: boolean) => {
    setVisible(false);
    resolveRef.current?.(accepted);
    resolveRef.current = null;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => answer(false)}>
      <View style={styles.backdrop}>
        <ThemedView style={styles.card} testID="location-disclosure">
          <View style={styles.badge}>
            <ThemedText style={styles.badgeIcon}>⌖</ThemedText>
          </View>
          <ThemedText style={styles.title}>{t('locationDisclosure.title')}</ThemedText>
          <ThemedText style={styles.body}>{t('locationDisclosure.body')}</ThemedText>
          <ThemedText style={styles.body}>{t('locationDisclosure.use')}</ThemedText>
          <ThemedText style={styles.hint}>{t('locationDisclosure.hint')}</ThemedText>

          <TouchableOpacity style={styles.primaryBtn} onPress={() => answer(true)} testID="button-location-disclosure-continue">
            <ThemedText style={styles.primaryBtnText}>{t('locationDisclosure.continue')}</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => answer(false)} testID="button-location-disclosure-decline">
            <ThemedText style={styles.secondaryBtnText}>{t('locationDisclosure.decline')}</ThemedText>
          </TouchableOpacity>
        </ThemedView>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  // centred text reads correctly in both LTR and forced-RTL layouts
  card: { borderRadius: 16, padding: 24, alignItems: 'center' },
  badge: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: '#E0E7FF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  badgeIcon: { fontSize: 30, color: '#5469D4', lineHeight: 34 },
  title: { fontSize: 19, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 10 },
  hint: { fontSize: 13, opacity: 0.7, textAlign: 'center', lineHeight: 19, marginTop: 4 },
  primaryBtn: {
    marginTop: 20, alignSelf: 'stretch', backgroundColor: '#5469D4',
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { marginTop: 8, paddingVertical: 12, alignItems: 'center', alignSelf: 'stretch' },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', opacity: 0.7 },
});
