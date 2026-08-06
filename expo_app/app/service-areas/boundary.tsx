import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { FilterChip, ScrollingChipRow } from '@/components/FilterChips';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { PolygonEditor, useRingEditor } from '@/components/PolygonEditor';
import {
  canonicalRing,
  checkRing,
  circleRing,
  parseWktPolygons,
  regionFor,
  ringAreaM2,
  ringCentroid,
  ringToWkt,
  ringsEqual,
  type LatLng,
} from '@/utils/wkt';

/**
 * Replace the boundary of an existing service area.
 *
 * THIS EXISTS BECAUSE THE PREMISE OF ITS ABSENCE WAS WRONG. #106 left geometry out of
 * the edit form on the belief that PUT accepts only {name, description}. Verified
 * against the live API: PUT {"geometry": "POLYGON((…))"} alone returns 200, replaces
 * the stored ring, and leaves name and description byte-identical — the domain uses
 * `exclude_unset=True`, so it is a true partial patch. The web app has done exactly
 * this PUT all along.
 *
 * IT TAKES ONLY A uuid. expo-router serialises params into the URL, and a 684-char
 * boundary in a deep link is both fragile and a second source of truth, so the ring is
 * refetched here and never travels through navigation.
 *
 * THE BODY IS {geometry} AND NOTHING ELSE. `created_by_uuid` is ACCEPTED on PUT and
 * silently reassigns authorship (verified: 200, author changed), so the only reliable
 * defence is that no code path here can send it. `geometry: null` and `geometry: ""`
 * are both 400.
 *
 * SAVE IS DISABLED WHILE THE RING IS UNCHANGED, compared as vertex arrays and never as
 * strings: GET returns "POLYGON ((a b, c d))" with spaces while we emit the compact
 * form, so a string compare would always claim a change.
 */
export default function ServiceAreaBoundaryScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const [name, setName] = useState('');
  const [savedRing, setSavedRing] = useState<LatLng[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<'load' | 'gone' | null>(null);
  const [saving, setSaving] = useState(false);
  const editor = useRingEditor([]);

  useEffect(() => {
    (async () => {
      const res = await apiCall<{ name?: string; geometry?: string | null }>(`/service-area/${uuid}`);
      if (!isOk(res.status)) {
        setFailed(res.status === 404 ? 'gone' : 'load');
        setLoading(false);
        return;
      }
      setName(res.data?.name ?? '');
      // canonicalRing drops the closing duplicate the store returns, so ring.length is
      // the honest vertex count and the stepper never lands on a phantom point
      const outer = canonicalRing(parseWktPolygons(res.data?.geometry ?? '')[0]?.coordinates ?? []);
      setSavedRing(outer.length >= 3 ? outer : null);
      editor.reset(outer);
      setLoading(false);
    })();
    // uuid is the only real input; editor.reset is stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid]);

  const problem = useMemo(() => checkRing(editor.ring), [editor.ring]);
  const changed = !!savedRing && !ringsEqual(editor.ring, savedRing);
  const canSave = !problem && changed && !saving;

  const confirmReplace = (then: () => void) =>
    Alert.alert(t('serviceAreas.replaceConfirm', { name }), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('detail.edit'), style: 'destructive', onPress: then },
    ]);

  const save = useCallback(async () => {
    if (!canSave) return;
    setSaving(true);
    // exactly one key. never created_by_uuid, never name, never description.
    const res = await apiCall(`/service-area/${uuid}`, {
      method: 'PUT',
      body: JSON.stringify({ geometry: ringToWkt(editor.ring) }),
    });
    setSaving(false);
    if (isOk(res.status)) {
      Alert.alert(t('serviceAreas.boundarySaved'));
      router.back();
      return;
    }
    // the server's 400 for a crossing ring contains U+2010 hyphens and reads like a
    // stack trace, and res.error is raw TEXT (an HTML page for a 500) — so it is never
    // shown; Save being disabled makes the 400 unreachable in normal use anyway
    Alert.alert(
      t('serviceAreas.boundarySaveFailed'),
      res.status === 400 ? t('serviceAreas.badGeometry')
      : res.status === 403 ? t('serviceAreas.notAllowed')
      : res.status === 404 ? t('serviceAreas.areaGone')
      : t('form.tryAgain'),
    );
  }, [canSave, editor.ring, router, t, uuid]);

  const leave = useCallback(() => {
    if (!changed) return router.back();
    Alert.alert(t('serviceAreas.discardBoundary'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('detail.delete'), style: 'destructive', onPress: () => router.back() },
    ]);
  }, [changed, router, t]);

  return (
    <ModuleGuard module="service-areas" requireAdmin>
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={leave} hitSlop={12} testID="sa-boundary-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {name || t('serviceAreas.boundaryTitle')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        {loading ? (
          <View style={styles.centre}><ActivityIndicator size="large" color="#5469D4" /></View>
        ) : failed ? (
          <View style={styles.centre}>
            <ThemedText style={styles.stateText}>
              {failed === 'gone' ? t('serviceAreas.areaGone') : t('moduleList.failed')}
            </ThemedText>
          </View>
        ) : !savedRing ? (
          // do not open the editor on an unparseable geometry — offer the honest option
          <View style={styles.centre}>
            <ThemedText style={styles.stateText}>{t('serviceAreas.noGeometry')}</ThemedText>
            <TouchableOpacity
              style={styles.retry}
              onPress={() => { setSavedRing([]); editor.reset([]); }}
            >
              <ThemedText style={styles.retryText}>{t('serviceAreas.drawNewShape')}</ThemedText>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: 40 + insets.bottom }]}
          >
            <PolygonEditor
              ring={editor.ring}
              onChange={editor.commit}
              onUndo={editor.undo}
              canUndo={editor.canUndo}
              problem={problem}
              savedRing={savedRing.length >= 3 ? savedRing : null}
              onRevertSaved={() => editor.commit(savedRing)}
              initialRegion={regionFor(savedRing)}
              testIDPrefix="sa-boundary"
            />

            <ScrollingChipRow>
              <FilterChip
                label={t('serviceAreas.drawNewShape')}
                active={false}
                onPress={() => confirmReplace(() => editor.commit([]))}
                testID="sa-boundary-new"
              />
              <FilterChip
                label={t('serviceAreas.replaceWithCircle')}
                active={false}
                onPress={() => confirmReplace(() => {
                  // the honest escape hatch for a ring that is genuinely a mess:
                  // same centroid, the radius that reproduces the same area, 12 points
                  const c = ringCentroid(savedRing);
                  const r = Math.sqrt(ringAreaM2(savedRing) / Math.PI);
                  editor.commit(circleRing(c.latitude, c.longitude, r, 12));
                })}
                testID="sa-boundary-circle"
              />
            </ScrollingChipRow>

            {!changed && !problem && (
              <ThemedText style={styles.note}>{t('serviceAreas.boundaryUnchanged')}</ThemedText>
            )}

            <TouchableOpacity
              style={[styles.submit, !canSave && styles.submitOff]}
              onPress={save}
              disabled={!canSave}
              testID="sa-boundary-save"
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <ThemedText style={styles.submitText}>{t('serviceAreas.saveBoundary')}</ThemedText>}
            </TouchableOpacity>
          </ScrollView>
        )}
      </ThemedView>
    </ModuleGuard>
  );
}

// the same tokens as the create screen: this is the same job on an existing record, and
// two boundary editors that looked different would read as two features
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  body: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 48 },
  note: { fontSize: 12, color: '#6B7280', lineHeight: 18, marginTop: 12 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  retry: {
    backgroundColor: '#5469D4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  submit: {
    marginTop: 24,
    backgroundColor: '#5469D4',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitOff: { opacity: 0.5 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
