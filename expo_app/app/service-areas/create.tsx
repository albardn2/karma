import React, { useMemo, useRef, useState } from 'react';
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
import MapView, { Circle, Polygon, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { Stack, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { FilterChip, ScrollingChipRow } from '@/components/FilterChips';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { circleRing, ringAreaM2, ringIsSane, ringToWkt } from '@/utils/wkt';

/** The repo's existing map fallback centre. */
const DAMASCUS = { latitude: 33.5138, longitude: 36.2765 };

/**
 * Radius presets, in metres.
 *
 * Not invented: the equal-area radii of the thirteen areas already in this database
 * span 1.2–11.4 km, so the ladder covers the real corpus with a little room either side.
 */
const RADII = [500, 1000, 2000, 3000, 5000, 8000, 12000];
const MIN_R = 100;
const MAX_R = 15000;
const STEP = 250;
const SEGMENTS = 48;

/**
 * Create a service area by placing a centre and choosing a radius.
 *
 * THE PHONE DOES NOT DRAW A BOUNDARY, IT GENERATES ONE, and that is the central
 * decision on this screen rather than a limitation of it.
 *
 * Tracing a boundary by hand here was considered and rejected on measurement, not
 * taste. Of the eleven real areas in this database, nine have adjacent vertices closer
 * together than a 44pt touch target when the area is fitted to a phone screen — the
 * tightest pair on DISTRIBUTION 1 sits about 6pt apart. Handing someone drag handles at
 * that density does not let them adjust a boundary, it lets them destroy one, and this
 * API has no undo: delete is soft-only, `is_deleted` is refused on PUT, and there is no
 * restore route. The web app already does this well with a mouse, and every one of those
 * thirteen areas was drawn there inside a single fortnight in October — this is not a
 * recurring field task.
 *
 * What IS a field task is "the area around here, about this big", and that is what this
 * screen does well.
 *
 * A GENERATED CONVEX RING CANNOT BE INVALID, which is why this screen carries no
 * geometry validator. It cannot self-intersect, cannot be unclosed, cannot be
 * degenerate. That matters because the server's rejection for a bad shape is a 400 whose
 * message reads like a library stack trace and contains non-ASCII hyphens — a string
 * that should never reach a user. Making the shape incapable of being wrong is a better
 * defence than translating the refusal.
 *
 * THE CENTRE IS THE SCREEN CENTRE, ALWAYS. The crosshair is drawn in the React overlay
 * and not on the map, and the coordinate comes from the map's own settled region. So
 * panning is the input: nothing accumulates, there is no vertex to place, and a jolt of
 * the wrist is undone by panning back. Compare the alternative — tapping to drop points —
 * where the same jolt commits a stray vertex, and on Android a tap is additionally
 * entangled with the double-tap-to-zoom gesture.
 *
 * The preview draws BOTH a <Circle> and the exact 48-gon that will be sent. That is
 * deliberate redundancy: a preview smoother than the thing being stored is a small lie,
 * and this is the one screen where the difference between intent and payload matters.
 */
export default function ServiceAreaCreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const mapRef = useRef<MapView | null>(null);

  const [centre, setCentre] = useState(DAMASCUS);
  const [radiusM, setRadiusM] = useState(2000);
  const [accuracyM, setAccuracyM] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const ring = useMemo(
    () => circleRing(centre.latitude, centre.longitude, radiusM, SEGMENTS),
    [centre, radiusM],
  );
  const km2 = useMemo(() => (ringAreaM2(ring) / 1e6).toFixed(1), [ring]);

  const setRadius = (m: number) => setRadiusM(Math.min(MAX_R, Math.max(MIN_R, m)));

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        // never block: the map still works, the centre is just wherever it is
        Alert.alert(t('serviceAreas.locationDenied'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setAccuracyM(pos.coords.accuracy ?? null);
      mapRef.current?.animateToRegion(
        {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          latitudeDelta: 0.09,
          longitudeDelta: 0.09,
        },
        400,
      );
    } catch {
      Alert.alert(t('serviceAreas.locationFailed'));
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    const trimmed = name.trim();
    // both of these are the client's job because the server does neither: a
    // 121-character name is a 500 with an HTML body, and an empty name is a 201
    if (!trimmed) return setNameError(t('form.required'));
    if (trimmed.length > 120) return setNameError(t('serviceAreas.nameTooLong'));
    if (radiusM < MIN_R || radiusM > MAX_R) {
      return Alert.alert(t('serviceAreas.radiusRange'));
    }
    if (!ringIsSane(ring)) return Alert.alert(t('serviceAreas.badCentre'));

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: trimmed,
        geometry: ringToWkt(ring),
      };
      if (description.trim()) body.description = description.trim();

      const res = await apiCall<{ uuid?: string }>('/service-area/', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (isOk(res.status)) {
        // uuid is the ONLY field of this response we touch. The 201 echoes back the
        // geometry string we sent rather than the canonical form the store holds, so
        // we navigate and let the detail screen refetch.
        const created = res.data?.uuid;
        if (created) router.replace(`/service-areas/${created}`);
        else router.back();
        return;
      }
      if (res.status === 409) {
        // the name is globally unique with no is_deleted predicate, so a deleted
        // area's name is a permanent conflict — worth saying on the field itself
        setNameError(t('serviceAreas.nameTaken'));
        return;
      }
      Alert.alert(
        t('form.saveFailed'),
        res.status === 403
          ? t('serviceAreas.notAllowed')
          : // res.error is raw response TEXT — for a 500 it is an HTML page, so it is
            // truncated and never parsed
            String(res.error ?? '').slice(0, 300) || t('form.tryAgain'),
      );
    } catch {
      Alert.alert(t('form.saveFailed'), t('form.tryAgain'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModuleGuard module="service-areas" requireAdmin>
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="form-cancel">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('serviceAreas.createTitle')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.top + 50}
        >
          <ScrollView
            contentContainerStyle={[styles.body, { paddingBottom: 40 + insets.bottom }]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.mapWrap}>
              <MapView
                ref={mapRef}
                style={styles.map}
                provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                initialRegion={{ ...DAMASCUS, latitudeDelta: 0.09, longitudeDelta: 0.09 }}
                showsUserLocation
                // the settled region only — never `details.isGesture`, which is
                // optional and Google-only
                onRegionChangeComplete={(r: Region) =>
                  setCentre({ latitude: r.latitude, longitude: r.longitude })
                }
                testID="sa-create-map"
              >
                <Circle
                  center={centre}
                  radius={radiusM}
                  strokeColor="rgba(84,105,212,0.45)"
                  fillColor="rgba(84,105,212,0.08)"
                />
                {/* the exact ring that will be POSTed, drawn over the smooth intent */}
                <Polygon
                  coordinates={ring}
                  strokeColor="rgba(84,105,212,0.85)"
                  fillColor="rgba(84,105,212,0.16)"
                  strokeWidth={2}
                  tappable={false}
                />
              </MapView>

              {/* in the RN overlay, not on the map: it must not move with the region */}
              <View style={styles.crosshairWrap} pointerEvents="none">
                <View style={styles.crossV} />
                <View style={styles.crossH} />
              </View>
              <View style={styles.hintWrap} pointerEvents="none">
                <ThemedText style={styles.hint}>{t('serviceAreas.centreHint')}</ThemedText>
              </View>
            </View>

            <View style={styles.locRow}>
              <TouchableOpacity
                style={styles.locBtn}
                onPress={useMyLocation}
                disabled={locating}
                testID="sa-use-location"
              >
                <ThemedText style={styles.locText}>
                  {locating ? t('serviceAreas.locating') : t('serviceAreas.useMyLocation')}
                </ThemedText>
              </TouchableOpacity>
              {accuracyM != null && (
                <ThemedText style={styles.accuracy}>
                  {t('serviceAreas.accuracy', { m: String(Math.round(accuracyM)) })}
                </ThemedText>
              )}
            </View>

            <ThemedText style={styles.label}>{t('serviceAreas.radius')}</ThemedText>
            <ScrollingChipRow>
              {RADII.map((m) => (
                <FilterChip
                  key={m}
                  label={
                    m < 1000
                      ? t('serviceAreas.radiusM', { m: String(m) })
                      : t('serviceAreas.radiusKm', { km: String(m / 1000) })
                  }
                  active={radiusM === m}
                  onPress={() => setRadius(m)}
                  testID={`sa-radius-${m}`}
                />
              ))}
            </ScrollingChipRow>

            <View style={styles.stepRow}>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setRadius(radiusM - STEP)}
                hitSlop={12}
                testID="sa-radius-minus"
              >
                <ThemedText style={styles.stepText}>−</ThemedText>
              </TouchableOpacity>
              <ThemedText style={styles.radiusNow} testID="sa-radius-now">
                {radiusM < 1000
                  ? t('serviceAreas.radiusM', { m: String(radiusM) })
                  : t('serviceAreas.radiusKm', { km: String(+(radiusM / 1000).toFixed(2)) })}
              </ThemedText>
              <TouchableOpacity
                style={styles.stepBtn}
                onPress={() => setRadius(radiusM + STEP)}
                hitSlop={12}
                testID="sa-radius-plus"
              >
                <ThemedText style={styles.stepText}>+</ThemedText>
              </TouchableOpacity>
            </View>

            {/* two rows, not one sentence: Latin digits and km² inside an Arabic
                sentence get reordered around the separator by bidi */}
            <ThemedText style={styles.readout} testID="sa-area">
              {t('serviceAreas.areaSize', { km2 })}
            </ThemedText>
            <ThemedText style={styles.readoutSmall} testID="sa-points">
              {t('serviceAreas.pointCount', { points: String(ring.length) })}
            </ThemedText>
            <ThemedText style={styles.note}>{t('serviceAreas.provisional')}</ThemedText>

            <ThemedText style={[styles.label, styles.spaced]}>
              {t('serviceAreas.name')} *
            </ThemedText>
            <TextInput
              style={[styles.input, !!nameError && styles.inputError]}
              value={name}
              onChangeText={(v) => {
                setName(v);
                if (nameError) setNameError('');
              }}
              placeholder={t('serviceAreas.namePlaceholder')}
              placeholderTextColor="#9ca3af"
              maxLength={120}
              testID="sa-name"
            />
            {!!nameError && <ThemedText style={styles.error}>{nameError}</ThemedText>}

            <ThemedText style={[styles.label, styles.spaced]}>
              {t('serviceAreas.description')}
            </ThemedText>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={description}
              onChangeText={setDescription}
              multiline
              testID="sa-description"
            />

            <TouchableOpacity
              style={[styles.submit, saving && styles.submitOff]}
              onPress={submit}
              disabled={saving}
              testID="form-submit"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <ThemedText style={styles.submitText}>{t('serviceAreas.save')}</ThemedText>
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
  mapWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  map: { height: 320 },
  crosshairWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crossV: { position: 'absolute', width: 2, height: 26, backgroundColor: '#1f2937', opacity: 0.75 },
  crossH: { position: 'absolute', width: 26, height: 2, backgroundColor: '#1f2937', opacity: 0.75 },
  hintWrap: { position: 'absolute', left: 0, right: 0, bottom: 10, alignItems: 'center' },
  hint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1f2937',
    backgroundColor: 'rgba(255,255,255,0.88)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  locBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  locText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  accuracy: { fontSize: 12, opacity: 0.6 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 6, opacity: 0.75 },
  spaced: { marginTop: 18 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 22, lineHeight: 26, fontWeight: '700', color: '#374151' },
  radiusNow: { fontSize: 15, fontWeight: '700', color: '#1f2937', minWidth: 74, textAlign: 'center' },
  readout: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: '#1f2937', marginTop: 14 },
  readoutSmall: { fontSize: 12, opacity: 0.6, marginTop: 2 },
  note: { fontSize: 12, opacity: 0.6, lineHeight: 18, marginTop: 10 },
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
  inputError: { borderColor: '#dc2626' },
  error: { fontSize: 12, color: '#dc2626', marginTop: 4 },
  multiline: { minHeight: 84, textAlignVertical: 'top' },
  submit: {
    marginTop: 24,
    backgroundColor: '#5469D4',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  submitOff: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
