import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { useTagCatalog } from '@/utils/tagCatalog';

// Mirror of the server rule (backend/app/dto/customer.py normalize_tags): one
// optional colon, both sides non-empty, no comma, <= 64, at most MAX_TAGS per
// customer. Keep in lockstep.
const MAX_TAG_LENGTH = 64;
const MAX_TAGS = 25;

export function normalizeTag(raw: string): string | null {
  const tag = raw.trim();
  if (!tag || tag.length > MAX_TAG_LENGTH || tag.includes(',') || tag.includes('،')) return null;
  if ((tag.match(/:/g) || []).length > 1) return null;
  if (tag.includes(':')) {
    const [key, value] = tag.split(':').map((p) => p.trim());
    if (!key || !value) return null;
    return `${key}:${value}`;
  }
  return tag;
}

// the key part of a normalized tag ("interest" for "interest:x", "vip" for "vip")
const tagKey = (tag: string) => (tag.includes(':') ? tag.slice(0, tag.indexOf(':')) : tag);

/**
 * Chip editor for a customer's tags. Type a "key" or "key:value" and tap Add
 * (or submit the field) to commit; tap ✕ on a chip to remove it. Suggestions
 * come from /customer/tags — tags already in use on this tenant — so spellings
 * converge. Value is the canonical string[] the API stores.
 */
export function TagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
}) {
  const { t, te } = useLanguage();
  const [draft, setDraft] = useState('');
  const [known, setKnown] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  // predefined distribution-analytics tags ("<tag> - <arabic>" labels);
  // labelFor renders a stored tag — translated for catalog hits, VERBATIM for
  // custom tags (never route a custom tag through te, it can mangle it)
  const { catalog, labelFor } = useTagCatalog();

  useEffect(() => {
    (async () => {
      const res = await apiCall<{ tags: string[] }>('/customer/tags');
      if (isOk(res.status) && res.data?.tags) setKnown(res.data.tags);
    })();
  }, []);

  const suggestions = useMemo(() => {
    const typed = draft.trim().toLowerCase();
    return known
      .filter((tag) => !value.includes(tag))
      .filter((tag) => !typed || tag.toLowerCase().includes(typed))
      .slice(0, 8);
  }, [known, value, draft]);

  const atCap = value.length >= MAX_TAGS;

  // clearDraft=false for the predefined picker, so choosing from it never
  // wipes a custom tag the user is mid-typing in the free-text box
  const add = (raw: string, clearDraft = true) => {
    const tag = normalizeTag(raw);
    if (!tag) return;
    // one value per key: adding "interest:not_interested" replaces any existing
    // "interest:*" rather than stacking a second value the server would reject.
    // Keys compare case-insensitively so "Blacklist" and "blacklist" can't
    // coexist as one-tap near-duplicates that would split analytics counts.
    const key = tagKey(tag).toLowerCase();
    const withoutSameKey = value.filter((existing) => tagKey(existing).toLowerCase() !== key);
    // cap on the RESULT, so swapping a same-key value is never blocked at the cap
    if (withoutSameKey.length >= MAX_TAGS) return;
    if (!withoutSameKey.includes(tag)) onChange([...withoutSameKey, tag]);
    if (clearDraft) setDraft('');
  };

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  // whether the predefined tag applies to this customer already (any case)
  const applied = (tag: string) => value.some((existing) => existing.toLowerCase() === tag.toLowerCase());

  // the picker stays available at the cap when it can still SWAP a same-key
  // value (add() permits that), e.g. flipping customer_sale:no_sale to
  // repeated_sale on a customer already carrying 25 tags
  const canPickPredefined =
    catalog.length > 0 &&
    (!atCap || catalog.some((entry) => value.some((existing) => tagKey(existing).toLowerCase() === tagKey(entry.tag).toLowerCase())));

  return (
    <View>
      {value.length > 0 && (
        <View style={styles.chipWrap}>
          {value.map((tag) => (
            <View key={tag} style={styles.chip} testID={`tag-chip-${tag}`}>
              <ThemedText style={styles.chipText}>{labelFor(tag)}</ThemedText>
              <TouchableOpacity onPress={() => remove(tag)} hitSlop={8} testID={`tag-remove-${tag}`}>
                <ThemedText style={styles.chipX}>✕</ThemedText>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {!atCap && (
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={() => add(draft)}
            blurOnSubmit={false}
            placeholder={t('custcreate.tagsPlaceholder')}
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            testID="tag-input"
          />
          <TouchableOpacity
            style={[styles.addButton, !normalizeTag(draft) && styles.addButtonDisabled]}
            onPress={() => add(draft)}
            disabled={!normalizeTag(draft)}
            testID="tag-add"
          >
            <ThemedText style={styles.addButtonText}>{t('custcreate.tagsAdd')}</ThemedText>
          </TouchableOpacity>
        </View>
      )}

      {/* predefined distribution-analytics tags: bottom-sheet picker fed by the
          server catalog, labels translated per language; the clean tag is what
          gets stored. Custom tags keep using the free-text input above. */}
      {canPickPredefined && (
        <TouchableOpacity
          style={styles.predefinedButton}
          onPress={() => setPickerOpen(true)}
          testID="tag-predefined"
        >
          <ThemedText style={styles.predefinedButtonText}>
            {t('custcreate.predefinedTags')} ▾
          </ThemedText>
        </TouchableOpacity>
      )}

      {!atCap && suggestions.length > 0 && (
        <View style={styles.suggestWrap}>
          {suggestions.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={styles.suggest}
              onPress={() => add(tag)}
              testID={`tag-suggest-${tag}`}
            >
              <ThemedText style={styles.suggestText}>+ {labelFor(tag)}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <ThemedText style={styles.modalTitle}>{t('custcreate.predefinedTags')}</ThemedText>
              <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={8}>
                <ThemedText style={styles.modalClose}>✕</ThemedText>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalList}>
              {catalog.map((entry) => (
                <TouchableOpacity
                  key={entry.tag}
                  style={styles.modalOption}
                  onPress={() => {
                    // keep the draft: picking predefined must not wipe a
                    // custom tag the user is mid-typing
                    add(entry.tag, false);
                    setPickerOpen(false);
                  }}
                  testID={`tag-predefined-opt-${entry.tag}`}
                >
                  <ThemedText
                    style={[styles.modalOptionText, applied(entry.tag) && styles.modalOptionActive]}
                  >
                    {applied(entry.tag) ? '✓ ' : ''}{te(entry.label)}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  chipText: { fontSize: 13, color: '#3730A3' },
  chipX: { fontSize: 12, color: '#6366F1', fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: '#fff',
    color: '#111827',
  },
  addButton: {
    backgroundColor: '#5469D4',
    borderRadius: 10,
    paddingVertical: 11,
    paddingHorizontal: 16,
  },
  addButtonDisabled: { opacity: 0.4 },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  suggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  suggest: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.18)',
    borderStyle: 'dashed',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  suggestText: { fontSize: 12, color: '#4b5563' },
  predefinedButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#5469D4',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
  },
  predefinedButtonText: { fontSize: 13, color: '#5469D4', fontWeight: '600' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  modalSheet: { backgroundColor: '#fff', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%', paddingBottom: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.1)' },
  modalTitle: { fontSize: 16, fontWeight: '700' },
  modalClose: { fontSize: 18, color: '#6b7280' },
  modalList: { paddingHorizontal: 8 },
  modalOption: { paddingVertical: 14, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)' },
  modalOptionText: { fontSize: 15, color: '#111827' },
  modalOptionActive: { fontWeight: '700', color: '#5469D4' },
});
