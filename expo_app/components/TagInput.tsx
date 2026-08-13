import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { ThemedText } from '@/components/ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';

// Mirror of the server rule (backend/app/dto/customer.py normalize_tags): one
// optional colon, both sides non-empty, no comma, <= 64, at most MAX_TAGS per
// customer. Keep in lockstep.
const MAX_TAG_LENGTH = 64;
const MAX_TAGS = 25;

export function normalizeTag(raw: string): string | null {
  const tag = raw.trim();
  if (!tag || tag.length > MAX_TAG_LENGTH || tag.includes(',')) return null;
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
  const { t } = useLanguage();
  const [draft, setDraft] = useState('');
  const [known, setKnown] = useState<string[]>([]);

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

  const add = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag) return;
    // one value per key: adding "interest:not_interested" replaces any existing
    // "interest:*" rather than stacking a second value the server would reject
    const key = tagKey(tag);
    const withoutSameKey = value.filter((existing) => tagKey(existing) !== key);
    // cap on the RESULT, so swapping a same-key value is never blocked at the cap
    if (withoutSameKey.length >= MAX_TAGS) return;
    if (!withoutSameKey.includes(tag)) onChange([...withoutSameKey, tag]);
    setDraft('');
  };

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  return (
    <View>
      {value.length > 0 && (
        <View style={styles.chipWrap}>
          {value.map((tag) => (
            <View key={tag} style={styles.chip} testID={`tag-chip-${tag}`}>
              <ThemedText style={styles.chipText}>{tag}</ThemedText>
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

      {!atCap && suggestions.length > 0 && (
        <View style={styles.suggestWrap}>
          {suggestions.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={styles.suggest}
              onPress={() => add(tag)}
              testID={`tag-suggest-${tag}`}
            >
              <ThemedText style={styles.suggestText}>+ {tag}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      )}
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
});
