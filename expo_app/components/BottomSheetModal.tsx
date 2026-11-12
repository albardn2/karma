import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/ThemedText';
import { KeyboardDoneBar } from '@/components/KeyboardDoneBar';

interface BottomSheetModalProps {
  visible: boolean;
  /** backdrop tap, Android back, and the caller's own Cancel all land here */
  onClose: () => void;
  title: string;
  /** a save in flight: the backdrop stops closing the sheet, so a stray tap cannot drop it */
  busy?: boolean;
  children: React.ReactNode;
}

/**
 * A sheet that slides up from the bottom for a short edit: a note, a price, a quantity.
 *
 * Its content rides above the keyboard: a sheet anchored to the screen's bottom with an
 * autoFocus input would sit entirely behind it, and a decimal pad has no return key
 * and a multiline Return types a newline, so nothing would close it. Tapping the
 * dimmed backdrop closes it, and taps inside reach their target while the keyboard
 * is up.
 *
 * Inputs that open a number pad should set inputAccessoryViewID to
 * KEYBOARD_DONE_BAR_ID; the sheet renders the bar.
 */
export function BottomSheetModal({ visible, onClose, title, busy = false, children }: BottomSheetModalProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdrop}
          onPress={busy ? undefined : onClose}
          accessibilityRole="button"
          testID="sheet-backdrop"
        />
        <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            {/* inside the sheet's own tree: iOS does not attach an accessory view
                rendered outside the modal's content to the inputs inside it */}
            <KeyboardDoneBar />
            <ThemedText style={styles.title}>{title}</ThemedText>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '80%',
  },
  title: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
});
