import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';

interface EditSheetProps {
  visible: boolean;
  title: string;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  /** the field(s) being edited */
  children: React.ReactNode;
  saveTestID?: string;
}

/**
 * A bottom sheet holding one small edit — a price, a quantity, a note — with
 * Cancel and Save.
 *
 * The sheets it replaces were a plain View pinned to the bottom of a Modal, so
 * on a phone the keyboard rose over the field and the buttons, and a number pad
 * has no return key to close it: the edit could be neither seen nor saved. The
 * simulator hid this, typing on the Mac keyboard. Here the sheet rides up with
 * the keyboard, so the field and Save stay in view whatever the keyboard.
 */
export function EditSheet({
  visible,
  title,
  saving,
  onCancel,
  onSave,
  children,
  saveTestID,
}: EditSheetProps) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const cancel = () => {
    if (!saving) onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={cancel}>
      {/* 'padding' on Android too: the app is edge-to-edge (app.json), which stops
          a Modal's window from resizing for the keyboard, so nothing else makes room
          for it there (as in TripFilterDropdowns) */}
      <KeyboardAvoidingView style={styles.avoider} behavior="padding">
        {/* tapping above the sheet cancels, as a sheet should */}
        <Pressable style={styles.backdrop} onPress={cancel} />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          {children}
          <View style={styles.row}>
            <TouchableOpacity style={styles.cancel} onPress={cancel} disabled={saving}>
              <ThemedText style={styles.cancelText}>{t('common.cancel')}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.save, saving && styles.saveOff]}
              onPress={onSave}
              disabled={saving}
              testID={saveTestID}
            >
              <ThemedText style={styles.saveText}>
                {saving ? t('custdetail.saving') : t('form.save')}
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const editSheetInput = StyleSheet.create({
  field: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111827',
  },
  multiline: { fontSize: 14, minHeight: 90, textAlignVertical: 'top' },
  error: { fontSize: 12, lineHeight: 16, color: '#dc2626', marginTop: 6 },
});

const styles = StyleSheet.create({
  avoider: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
  },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 10, color: '#111827' },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  cancel: { paddingHorizontal: 14, paddingVertical: 10 },
  cancelText: { color: '#6b7280', fontWeight: '600' },
  save: { backgroundColor: '#5469D4', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  saveOff: { opacity: 0.6 },
  saveText: { color: '#fff', fontWeight: '700' },
});
