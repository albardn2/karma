import React from 'react';
import { InputAccessoryView, Keyboard, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';

/** Pass as a TextInput's inputAccessoryViewID to show the bar above its keyboard. */
export const KEYBOARD_DONE_BAR_ID = 'keyboard-done-bar';

/**
 * A "Done" bar above the iOS keyboard.
 *
 * The number and decimal pads have no return key, so without this a numeric field
 * can only be left by tapping somewhere else. Render it once per screen; every input
 * that names KEYBOARD_DONE_BAR_ID shares it. Android's number pad has its own Done.
 */
export function KeyboardDoneBar() {
  const { t } = useLanguage();
  if (Platform.OS !== 'ios') return null;
  return (
    <InputAccessoryView nativeID={KEYBOARD_DONE_BAR_ID}>
      <View style={styles.bar}>
        <TouchableOpacity onPress={() => Keyboard.dismiss()} hitSlop={10} testID="keyboard-done">
          <ThemedText style={styles.done}>{t('common.done')}</ThemedText>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#f3f4f6',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.15)',
  },
  done: { fontSize: 16, fontWeight: '700', color: '#5469D4' },
});
