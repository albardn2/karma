import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { PickerField, PickerSpec } from '@/components/PickerField';

export interface FormField {
  name: string;
  label: string;
  kind?: 'text' | 'number' | 'multiline' | 'select' | 'boolean' | 'picker';
  required?: boolean;
  placeholder?: string;
  /** for kind 'select'; for 'boolean' the values must be 'true' and 'false' */
  options?: Array<{ value: string; label: string }>;
  /** for kind 'picker' — choose one record from a list endpoint */
  picker?: PickerSpec;
  /**
   * Bounds for kind 'number', inclusive, and whether a fraction is legal.
   *
   * Worth stating in the spec rather than only in the label: the server's own bounds
   * are inclusive and its 422 arrives as one unattributed blob, so an out-of-range
   * value would otherwise be rejected without saying which field caused it.
   */
  min?: number;
  max?: number;
  integer?: boolean;
  /**
   * Show this field only for certain answers to earlier ones. A hidden field is not
   * rendered, not validated and not submitted — otherwise a `required` field the user
   * cannot see would block the form with an error pointing at nothing.
   */
  visibleWhen?: (values: Record<string, string>) => boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
}

interface ModuleFormProps {
  module?: string;
  /**
   * A scope the caller must hold instead of (or as well as) a module — for forms over
   * settings with no MODULES entry, such as the platform console's.
   */
  requireScope?: string;
  /**
   * Admin or platform owner — see ModuleGuard's requireAdmin for why neither a module
   * nor a scope can express that set.
   */
  requireAdmin?: boolean;
  title: string;
  fields: FormField[];
  /** initial values — supply for an edit, omit for a create */
  initial?: Record<string, any>;
  /**
   * Fixed body values the user does not choose, merged into every submission.
   *
   * For actions taken *against* an existing record: the link uuid and any field the
   * server requires to agree with it. A payout against an expense must carry that
   * expense's currency exactly — offering it as an input would only let someone pick
   * the one value guaranteed to be rejected.
   */
  extra?: Record<string, any>;
  /**
   * Reshape the flat field/value body into whatever the endpoint wants, after
   * validation and after `extra` is merged.
   *
   * Some writes are not flat: fulfill-items takes {items: [{…}]}, a batch shape even
   * for one line. Rather than teach the field spec about nesting, the form collects
   * flat answers and the screen states the shape.
   */
  transform?: (body: Record<string, any>) => any;
  /**
   * A short explanation shown above the fields — for a constraint the form cannot
   * express by omitting an input, e.g. that a receipt is always the full ordered
   * quantity. Leaving the user to discover that from a rejection is worse.
   */
  note?: string;
  /** POST to create, PUT to edit */
  method: 'POST' | 'PUT';
  endpoint: string;
  /** where to go after a successful write */
  onDone?: () => void;
}

/**
 * A create/edit form from a field spec.
 *
 * The app's one hand-written form (customers/create) is ~630 lines, most of it
 * state plumbing and validation that is identical for every resource. With write
 * paths needed across a dozen modules, that shape belongs in one place.
 *
 * Two behaviours that matter more than they look:
 *
 * ONLY CHANGED FIELDS ARE SENT on an edit. The update DTOs are extra="forbid" and
 * several reject fields the read model happily returns, so echoing the whole record
 * back 422s. Sending the diff also avoids clobbering a field someone else changed.
 *
 * EMPTY MEANS OMITTED, not empty-string. Several list and update DTOs reject an
 * empty value for a typed field, so a cleared optional input must disappear from
 * the payload rather than be sent as "".
 */
export function ModuleForm({
  module,
  requireScope,
  requireAdmin,
  title,
  fields,
  initial,
  extra,
  transform,
  note,
  method,
  endpoint,
  onDone,
}: ModuleFormProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) {
      const raw = initial?.[f.name];
      v[f.name] = raw == null ? '' : String(raw);
    }
    return v;
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => (prev[name] ? { ...prev, [name]: '' } : prev));
  };

  // recomputed every render, so a field can appear the moment its condition is met
  const shownFields = fields.filter((f) => (f.visibleWhen ? f.visibleWhen(values) : true));

  const build = (): Record<string, any> | null => {
    const body: Record<string, any> = {};
    const found: Record<string, string> = {};

    for (const f of shownFields) {
      const raw = (values[f.name] ?? '').trim();
      if (f.required && !raw) {
        found[f.name] = t('form.required');
        continue;
      }
      if (!raw) continue;

      let parsed: any = raw;
      if (f.kind === 'number') {
        parsed = Number(raw);
        if (Number.isNaN(parsed)) {
          found[f.name] = t('form.mustBeNumber');
          continue;
        }
        if (f.integer && !Number.isInteger(parsed)) {
          found[f.name] = t('form.mustBeWhole');
          continue;
        }
        if (f.min != null && parsed < f.min) {
          found[f.name] = t('form.minValue', { min: f.min });
          continue;
        }
        if (f.max != null && parsed > f.max) {
          found[f.name] = t('form.maxValue', { max: f.max });
          continue;
        }
      } else if (f.kind === 'boolean') {
        // a real JSON boolean, not the string "true" — the DTO field is typed bool
        // and relying on Pydantic's lax coercion to fix our payload is a bet we do
        // not need to take
        parsed = raw === 'true';
      }
      // on an edit, skip anything the user did not actually change
      if (method === 'PUT' && initial && String(initial[f.name] ?? '') === raw) continue;
      body[f.name] = parsed;
    }

    if (Object.keys(found).length) {
      setErrors(found);
      return null;
    }
    return body;
  };

  const submit = async () => {
    const built = build();
    if (!built) return;
    // extra last: a fixed value is not the user's to override
    const flat = { ...built, ...(extra ?? {}) };
    const body = transform ? transform(flat) : flat;
    if (method === 'PUT' && Object.keys(flat).length === 0) {
      // nothing changed — a PUT with an empty body is a pointless round trip and
      // some update DTOs reject it outright
      router.back();
      return;
    }
    setSaving(true);
    try {
      const res = await apiCall(endpoint, { method, body: JSON.stringify(body) });
      if (isOk(res.status)) {
        onDone ? onDone() : router.back();
      } else {
        // surface what the server actually said — a 422 names the offending field,
        // and hiding that behind "something went wrong" makes it unfixable
        Alert.alert(t('form.saveFailed'), String(res.error ?? '').slice(0, 300) || t('form.tryAgain'));
      }
    } catch (e) {
      Alert.alert(t('form.saveFailed'), t('form.tryAgain'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModuleGuard module={module} requireScope={requireScope} requireAdmin={requireAdmin}>
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="form-cancel">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {title}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.top + 50}
        >
          <ScrollView contentContainerStyle={[styles.body, { paddingBottom: 40 + insets.bottom }]}>
            {!!note && <ThemedText style={styles.note}>{note}</ThemedText>}
            {shownFields.map((f) => (
              <View key={f.name} style={styles.field}>
                <ThemedText style={styles.label}>
                  {f.label}
                  {f.required ? ' *' : ''}
                </ThemedText>

                {f.kind === 'picker' && f.picker ? (
                  <PickerField
                    spec={f.picker}
                    value={values[f.name] ?? ''}
                    onChange={(v) => set(f.name, v)}
                    testID={`form-${f.name}`}
                  />
                ) : f.kind === 'select' || f.kind === 'boolean' ? (
                  <View style={styles.options}>
                    {(f.options ?? []).map((o) => {
                      const on = values[f.name] === o.value;
                      return (
                        <TouchableOpacity
                          key={o.value}
                          style={[styles.option, on && styles.optionOn]}
                          onPress={() => set(f.name, on ? '' : o.value)}
                          testID={`form-${f.name}-${o.value}`}
                        >
                          <ThemedText style={[styles.optionText, on && styles.optionTextOn]}>
                            {o.label}
                          </ThemedText>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <TextInput
                    style={[
                      styles.input,
                      f.kind === 'multiline' && styles.inputMultiline,
                      !!errors[f.name] && styles.inputError,
                    ]}
                    value={values[f.name]}
                    onChangeText={(v) => set(f.name, v)}
                    placeholder={f.placeholder}
                    placeholderTextColor="#9ca3af"
                    multiline={f.kind === 'multiline'}
                    keyboardType={
                      f.keyboardType ?? (f.kind === 'number' ? 'numeric' : 'default')
                    }
                    autoCapitalize={f.keyboardType === 'email-address' ? 'none' : 'sentences'}
                    testID={`form-${f.name}`}
                  />
                )}

                {!!errors[f.name] && (
                  <ThemedText style={styles.error}>{errors[f.name]}</ThemedText>
                )}
              </View>
            ))}

            <TouchableOpacity
              style={[styles.submit, saving && styles.submitOff]}
              onPress={submit}
              disabled={saving}
              testID="form-submit"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.submitText}>{t('form.save')}</ThemedText>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </ThemedView>
    </ModuleGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 20, paddingTop: 6 },
  field: { marginBottom: 16 },
  note: { fontSize: 13, opacity: 0.7, lineHeight: 19, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, opacity: 0.75 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  inputMultiline: { minHeight: 90, textAlignVertical: 'top' },
  inputError: { borderColor: '#dc2626' },
  error: { fontSize: 12, color: '#dc2626', marginTop: 4 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  optionOn: { backgroundColor: '#5469D4', borderColor: '#5469D4' },
  optionText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  optionTextOn: { color: '#fff' },
  submit: {
    marginTop: 8,
    backgroundColor: '#5469D4',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitOff: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
