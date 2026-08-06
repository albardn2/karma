import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  Alert,
  I18nManager,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, {
  Circle,
  Marker,
  Polygon,
  Polyline,
  PROVIDER_GOOGLE,
  type MapPressEvent,
  type Region,
} from 'react-native-maps';
import { ThemedText } from '@/components/ThemedText';
import { FilterChip, ScrollingChipRow } from '@/components/FilterChips';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  canonicalRing,
  formatKm2,
  metresBetween,
  ringAreaM2,
  ringMinVertexGapM,
  type LatLng,
  type RingProblem,
} from '@/utils/wkt';

/**
 * Hand-authoring and hand-editing of a service-area boundary.
 *
 * WHY THIS IS NOT DRAG HANDLES. react-native-maps 1.20.1 declares ONE manager-level
 * `BOOL _hasObserver` (ios/AirMaps/AIRMapManager.m:43) and adds a KVO observer on a
 * dragging annotation view's `center` unconditionally (:867), removing it under that
 * single flag (:863). Two interleaved marker drags therefore leave one MKAnnotationView
 * permanently observed, and deallocating it is a hard crash. `draggable` is off the
 * table everywhere in this app, so movement is SELECT-then-PLACE.
 *
 * WHY THERE IS A GEOMETRIC TAP GUARD AND NOT `stopPropagation`. On iOS Apple Maps the
 * map's tap recogniser is created with `cancelsTouchesInView = NO` (:66) and
 * `handleMapTap:` ends with an unconditional `map.onPress(...)` (:601-698) with no
 * early return when an annotation was hit — `stopPropagation` only suppresses the
 * BUBBLED marker event, never the gesture-recogniser path. Without the guard below,
 * selecting a vertex would silently drop a duplicate vertex on top of it. The guard
 * runs BEFORE any mutation, so it does not care which event arrives first.
 *
 * WHY SELECTION IS A STEPPER FIRST AND TAPPING SECOND. Measured on the 13 live areas
 * fitted to a 390x420pt map: 11 of 15 edges on the two densest rings are under 44pt
 * apart, minimum 5.2pt, and DISTRIBUTION 1 needs ~8.5x zoom before its vertices are
 * individually tappable. A stepper needs zero touch precision and always terminates —
 * the largest real ring is 17 vertices.
 *
 * WHY THE POLYGON HAS NO onPress. On Apple, handleMapTap fires `polygon.onPress` for
 * every polygon containing the tap and THEN the map press, so a polygon handler here
 * would double-fire on every tap inside the shape.
 */

const TAP_GUARD_PT = 22;
const SELECT_HALO_PT = 18;
/** Below this on-screen vertex gap, tapping a specific vertex is not realistic. */
const TAPPABLE_GAP_PT = 44;
/** Android only: how long a map press waits to see whether it was half a double tap. */
const ANDROID_TAP_DEFER_MS = 250;

const INDIGO = '#5469D4';
const RED = '#DC2626';

// --- history ---------------------------------------------------------------

interface RingState {
  ring: LatLng[];
  past: LatLng[][];
}
type RingAction =
  | { type: 'commit'; ring: LatLng[] }
  | { type: 'undo' }
  | { type: 'reset'; ring: LatLng[] };

function ringReducer(s: RingState, a: RingAction): RingState {
  switch (a.type) {
    case 'commit':
      // 40 snapshots of at most 200 points is nothing, and a snapshot stack undoes an
      // add, a move, an insert, a remove, a start-over and a circle conversion alike.
      // leaflet-draw's "delete last point" can only undo an add, and only while drawing.
      return { ring: a.ring, past: [...s.past.slice(-39), s.ring] };
    case 'undo':
      return s.past.length
        ? { ring: s.past[s.past.length - 1], past: s.past.slice(0, -1) }
        : s;
    case 'reset':
      return { ring: a.ring, past: [] };
  }
}

/** A reducer rather than two useStates: undo must move ring and past atomically. */
export function useRingEditor(initial: LatLng[]) {
  const [state, dispatch] = useReducer(ringReducer, { ring: initial, past: [] });
  return {
    ring: state.ring,
    canUndo: state.past.length > 0,
    commit: useCallback((ring: LatLng[]) => dispatch({ type: 'commit', ring }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    reset: useCallback((ring: LatLng[]) => dispatch({ type: 'reset', ring }), []),
  };
}

// --- geometry helpers used only for hit-testing on screen -------------------

/** Metres per screen point at the settled region — synchronous, no native call. */
export function metresPerPoint(r: Region, widthPt: number): number {
  return (r.longitudeDelta * 111320 * Math.cos((r.latitude * Math.PI) / 180)) /
    Math.max(widthPt, 1);
}

function nearestVertex(ring: LatLng[], c: LatLng): { index: number; metres: number } | null {
  let best: { index: number; metres: number } | null = null;
  for (let i = 0; i < ring.length; i++) {
    const m = metresBetween(ring[i], c);
    if (!best || m < best.metres) best = { index: i, metres: m };
  }
  return best;
}

const midpoint = (a: LatLng, b: LatLng): LatLng => ({
  latitude: (a.latitude + b.latitude) / 2,
  longitude: (a.longitude + b.longitude) / 2,
});

// --- component -------------------------------------------------------------

export interface PolygonEditorProps {
  /** OPEN ring. Closure belongs to ringToWkt, which is the only wire-format author. */
  ring: LatLng[];
  onChange: (next: LatLng[]) => void;
  onUndo: () => void;
  canUndo: boolean;
  /** Computed once by the host with checkRing, so Save and this display agree. */
  problem: RingProblem | null;
  /** The stored boundary, drawn as a dashed underlay. Null while creating. */
  savedRing?: LatLng[] | null;
  onRevertSaved?: () => void;
  initialRegion: Region;
  height?: number;
  testIDPrefix?: string;
}

export function PolygonEditor({
  ring,
  onChange,
  onUndo,
  canUndo,
  problem,
  savedRing,
  onRevertSaved,
  initialRegion,
  height = 360,
  testIDPrefix = 'sa-edit',
}: PolygonEditorProps) {
  const { t } = useLanguage();
  const mapRef = useRef<MapView | null>(null);
  const regionRef = useRef<Region>(initialRegion);
  const widthRef = useRef(360);
  const pendingTap = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [selected, setSelected] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [mpp, setMpp] = useState(() => metresPerPoint(initialRegion, 360));

  useEffect(() => () => {
    if (pendingTap.current) clearTimeout(pendingTap.current);
  }, []);

  const canonical = useMemo(() => canonicalRing(ring), [ring]);
  const km2 = useMemo(() => ringAreaM2(canonical) / 1e6, [canonical]);

  // shown once, non-blocking: on 10 of the 13 real areas the vertices are too close
  // together to tap individually at fit zoom, and the stepper is the way through
  useEffect(() => {
    if (ring.length < 4) return;
    const gapPt = ringMinVertexGapM(ring) / mpp;
    if (gapPt < TAPPABLE_GAP_PT) setHint('serviceAreas.zoomToTapPoints');
    // deliberately not reacting to mpp: this is a one-off orientation message
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fit = useCallback(() => {
    if (ring.length < 2) return;
    mapRef.current?.fitToCoordinates(ring, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
  }, [ring]);

  const showVertex = useCallback((i: number) => {
    const p = ring[i];
    const r = regionRef.current;
    const offLat = Math.abs(p.latitude - r.latitude) > r.latitudeDelta * 0.4;
    const offLon = Math.abs(p.longitude - r.longitude) > r.longitudeDelta * 0.4;
    // without this, "Point 12 of 17" can select something that is not on screen
    if (offLat || offLon) {
      mapRef.current?.animateToRegion(
        { ...p, latitudeDelta: r.latitudeDelta, longitudeDelta: r.longitudeDelta },
        250,
      );
    }
  }, [ring]);

  const step = useCallback((delta: number) => {
    if (!ring.length) return;
    const next =
      selected == null
        ? delta > 0 ? 0 : ring.length - 1
        : (selected + delta + ring.length) % ring.length;
    setSelected(next);
    showVertex(next);
  }, [ring.length, selected, showVertex]);

  const applyPoint = useCallback((c: LatLng) => {
    const near = nearestVertex(ring, c);
    if (near && near.metres < TAP_GUARD_PT * mpp) {
      // Two reasons, and the first is not optional. (1) On iOS Apple Maps a tap on a
      // vertex Marker fires the marker's onPress AND, from a separate gesture
      // recogniser, MapView.onPress, with no prop that can stop the second — without
      // this, selecting a vertex would also drop a duplicate on top of it.
      // (2) A vertex a finger-width from its neighbour is a shape nobody can edit
      // afterwards. It is refused out loud, never silently.
      setHint('serviceAreas.tapTooClose');
      return;
    }
    setHint(null);
    if (selected != null) {
      const next = ring.slice();
      next[selected] = c;
      onChange(next);
    } else {
      onChange([...ring, c]);
    }
  }, [mpp, onChange, ring, selected]);

  const onMapPress = useCallback((e: MapPressEvent) => {
    const c = e.nativeEvent.coordinate;
    if (Platform.OS === 'android') {
      // iOS is proven safe by `[tap requireGestureRecognizerToFail:doubleTap]`
      // (AIRMapManager.m:60). Whether Android's double-tap-to-zoom also delivers
      // onMapClick is unverified, so on Android the add is deferred just long enough
      // for onDoublePress to cancel it. Drop this branch once the emulator check in
      // the verification plan proves it unnecessary.
      if (pendingTap.current) clearTimeout(pendingTap.current);
      pendingTap.current = setTimeout(() => {
        pendingTap.current = null;
        applyPoint(c);
      }, ANDROID_TAP_DEFER_MS);
      return;
    }
    applyPoint(c);
  }, [applyPoint]);

  const addAtCrosshair = useCallback(() => {
    const r = regionRef.current;
    applyPoint({ latitude: r.latitude, longitude: r.longitude });
  }, [applyPoint]);

  const insertAfter = useCallback(() => {
    if (selected == null || ring.length < 2) return;
    const j = (selected + 1) % ring.length;
    const next = ring.slice();
    next.splice(selected + 1, 0, midpoint(ring[selected], ring[j]));
    onChange(next);
    setSelected(selected + 1);
  }, [onChange, ring, selected]);

  const removeSelected = useCallback(() => {
    if (selected == null) return;
    // the web's floor is 4 RING points, i.e. 3 distinct — identical
    if (canonical.length <= 3) return;
    const next = ring.slice();
    next.splice(selected, 1);
    onChange(next);
    setSelected(null);
  }, [canonical.length, onChange, ring, selected]);

  const startOver = useCallback(() => {
    if (!ring.length) return;
    Alert.alert(
      t('serviceAreas.startOver'),
      t('serviceAreas.startOverConfirm', { n: String(canonical.length) }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('serviceAreas.startOver'),
          style: 'destructive',
          onPress: () => {
            onChange([]);          // one Undo brings it back
            setSelected(null);
          },
        },
      ],
    );
  }, [canonical.length, onChange, ring.length, t]);

  const problemText = (p: RingProblem): string => {
    switch (p.kind) {
      case 'tooFew': return t('serviceAreas.ringTooFew');
      case 'tooMany': return t('serviceAreas.ringTooMany', { max: String(p.max) });
      case 'outOfRange': return t('serviceAreas.ringOutOfRange');
      case 'tooClose': return t('serviceAreas.ringTooClose');
      case 'crosses': return t('serviceAreas.ringCrosses');
      case 'nearlyCrosses': return t('serviceAreas.ringNearlyCrosses');
      case 'tooSmall': return t('serviceAreas.ringTooSmall');
    }
  };

  const bad = problem?.kind === 'crosses' || problem?.kind === 'nearlyCrosses';
  const stroke = bad ? RED : INDIGO;
  const edge = (i: number): LatLng[] => [ring[i], ring[(i + 1) % ring.length]];

  // glyphs do not mirror under forceRTL, so they are chosen by direction; the LABELS
  // are "previous"/"next", never "left"/"right"
  const prevGlyph = I18nManager.isRTL ? '›' : '‹';
  const nextGlyph = I18nManager.isRTL ? '‹' : '›';

  return (
    <View>
      <View style={[styles.mapWrap, { height }]}>
        <MapView
          ref={mapRef}
          style={styles.flex}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={initialRegion}
          showsUserLocation
          // Android re-centres the map on a tapped marker by default
          // (MapView.java:105/306), which would yank the crosshair away mid-edit
          moveOnMarkerPress={false}
          onPress={onMapPress}
          onDoublePress={() => {
            if (pendingTap.current) {
              clearTimeout(pendingTap.current);
              pendingTap.current = null;
            }
          }}
          onLayout={(e) => {
            widthRef.current = e.nativeEvent.layout.width;
            setMpp(metresPerPoint(regionRef.current, widthRef.current));
          }}
          onRegionChangeComplete={(r: Region) => {
            regionRef.current = r;
            setMpp(metresPerPoint(r, widthRef.current));
          }}
          testID={`${testIDPrefix}-map`}
        >
          {/* the saved boundary, so the delta is visible rather than remembered */}
          {!!savedRing && savedRing.length >= 3 && (
            <Polyline
              coordinates={[...savedRing, savedRing[0]]}
              strokeColor="rgba(31,41,55,0.45)"
              strokeWidth={1.5}
              lineDashPattern={[3, 5]}
            />
          )}

          {ring.length >= 3 && (
            <Polygon
              coordinates={ring}
              strokeColor={stroke}
              fillColor={bad ? 'rgba(220,38,38,0.14)' : 'rgba(84,105,212,0.16)'}
              strokeWidth={2}
              // no onPress: handleMapTap fires polygon.onPress AND then map.onPress
              tappable={false}
            />
          )}
          {ring.length === 2 && (
            <Polyline coordinates={ring} strokeColor={stroke} strokeWidth={2} />
          )}
          {/* the auto-closing edge, shown only while authoring from nothing, so it is
              obvious the ring closes itself */}
          {ring.length >= 3 && !savedRing && (
            <Polyline
              coordinates={[ring[ring.length - 1], ring[0]]}
              strokeColor={stroke}
              strokeWidth={2}
              lineDashPattern={[6, 6]}
            />
          )}

          {/* the two offending edges, drawn thick and red. leaflet-draw only flashes
              the whole shape amber, which does not say WHERE. */}
          {bad && problem && (
            <>
              <Polyline coordinates={edge(problem.a)} strokeColor={RED} strokeWidth={4} />
              <Polyline coordinates={edge(problem.b)} strokeColor={RED} strokeWidth={4} />
            </>
          )}

          {/* a Circle, not a second marker view: radius is in metres, so 18pt x
              metres-per-point holds a constant on-screen size across zooms and no
              marker view ever has to mutate */}
          {selected != null && ring[selected] && (
            <Circle
              center={ring[selected]}
              radius={SELECT_HALO_PT * mpp}
              strokeColor={INDIGO}
              strokeWidth={2}
              fillColor="rgba(84,105,212,0.18)"
            />
          )}

          {ring.map((p, i) => (
            <Marker
              key={`v${i}`}
              coordinate={p}
              anchor={{ x: 0.5, y: 0.5 }}          // Android + iOS-Google
              centerOffset={{ x: 0, y: 0 }}         // iOS-Apple
              // safe here ONLY because the child is a fixed-size, background-colour
              // View with nothing asynchronous in it — the Android blank-marker hazard
              // needs an async child
              tracksViewChanges={false}
              stopPropagation
              // no title/description, so there is no callout to pop up
              onPress={() => {
                setSelected((s) => (s === i ? null : i));
                setHint(null);
              }}
              testID={`${testIDPrefix}-vertex-${i}`}
            >
              <View style={[styles.dot, selected === i && styles.dotOn]} />
            </Marker>
          ))}
        </MapView>

        {/* in the RN overlay, so it does not move with the region */}
        <View style={styles.crosshairWrap} pointerEvents="none">
          <View style={styles.crossV} />
          <View style={styles.crossH} />
        </View>

        {!!hint && (
          <View style={styles.hintWrap}>
            <ThemedText style={styles.hint}>{t(hint)}</ThemedText>
          </View>
        )}

        {/* full-width and pinned to the frame's bottom edge: position-neutral under
            forceRTL, never under a fingertip, and it cannot mis-fire on a pan */}
        <TouchableOpacity
          style={styles.primary}
          onPress={addAtCrosshair}
          testID={`${testIDPrefix}-add`}
        >
          <ThemedText style={styles.primaryText}>
            {selected == null ? t('serviceAreas.addPoint') : t('serviceAreas.movePoint')}
          </ThemedText>
        </TouchableOpacity>
      </View>

      <View style={styles.stepRow}>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => step(-1)}
          disabled={!ring.length}
          hitSlop={10}
          accessibilityLabel={t('serviceAreas.previousPoint')}
          testID={`${testIDPrefix}-prev`}
        >
          <ThemedText style={styles.stepGlyph}>{prevGlyph}</ThemedText>
        </TouchableOpacity>
        <ThemedText style={styles.stepLabel} testID={`${testIDPrefix}-selected`}>
          {selected == null
            ? t('serviceAreas.noPointSelected')
            : t('serviceAreas.selectedPoint', { i: String(selected + 1), n: String(ring.length) })}
        </ThemedText>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => step(1)}
          disabled={!ring.length}
          hitSlop={10}
          accessibilityLabel={t('serviceAreas.nextPoint')}
          testID={`${testIDPrefix}-next`}
        >
          <ThemedText style={styles.stepGlyph}>{nextGlyph}</ThemedText>
        </TouchableOpacity>
      </View>

      <ScrollingChipRow>
        {selected != null && (
          <FilterChip
            label={t('serviceAreas.insertAfter')}
            active={false}
            onPress={insertAfter}
            testID={`${testIDPrefix}-insert`}
          />
        )}
        {selected != null && canonical.length > 3 && (
          <FilterChip
            label={t('serviceAreas.removePoint')}
            active={false}
            onPress={removeSelected}
            testID={`${testIDPrefix}-remove`}
          />
        )}
        {selected != null && (
          <FilterChip
            label={t('serviceAreas.deselect')}
            active={false}
            onPress={() => setSelected(null)}
            testID={`${testIDPrefix}-deselect`}
          />
        )}
        {canUndo && (
          <FilterChip
            label={t('serviceAreas.undo')}
            active={false}
            onPress={() => { onUndo(); setSelected(null); }}
            testID={`${testIDPrefix}-undo`}
          />
        )}
        <FilterChip
          label={t('serviceAreas.fitShape')}
          active={false}
          onPress={fit}
          testID={`${testIDPrefix}-fit`}
        />
        {!!ring.length && (
          <FilterChip
            label={t('serviceAreas.startOver')}
            active={false}
            onPress={startOver}
            testID={`${testIDPrefix}-startover`}
          />
        )}
        {!!savedRing && !!onRevertSaved && (
          <FilterChip
            label={t('serviceAreas.revertSaved')}
            active={false}
            onPress={() => { onRevertSaved(); setSelected(null); }}
            testID={`${testIDPrefix}-revert`}
          />
        )}
      </ScrollingChipRow>

      {/* separate lines, not one sentence: Latin digits and km² inside an Arabic
          sentence get reordered around the separator */}
      <ThemedText style={styles.readout} testID={`${testIDPrefix}-area`}>
        {t('serviceAreas.areaSize', { km2: formatKm2(km2) })}
      </ThemedText>
      <ThemedText style={styles.readoutSmall} testID={`${testIDPrefix}-points`}>
        {t('serviceAreas.pointCount', { points: String(canonical.length) })}
      </ThemedText>
      {!!savedRing && (
        <ThemedText style={styles.readoutSmall}>{t('serviceAreas.savedOutline')}</ThemedText>
      )}
      {!!problem && (
        <>
          <ThemedText style={styles.problem} testID={`${testIDPrefix}-problem`}>
            {problemText(problem)}
          </ThemedText>
          {/* two Latin indices inside an RTL sentence do not interpolate cleanly, so
              they get their own line; the red edges are the real pointer anyway */}
          {bad && problem && 'a' in problem && (
            <ThemedText style={styles.problemAt}>
              {t('serviceAreas.ringProblemAt', {
                a: String(problem.a + 1),
                b: String(problem.b + 1),
              })}
            </ThemedText>
          )}
        </>
      )}
      {!problem && <ThemedText style={styles.hintLine}>{t('serviceAreas.drawHint')}</ThemedText>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  mapWrap: { position: 'relative', borderRadius: 12, overflow: 'hidden' },
  crosshairWrap: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  crossV: { position: 'absolute', width: 2, height: 26, backgroundColor: '#1f2937', opacity: 0.75 },
  crossH: { position: 'absolute', width: 26, height: 2, backgroundColor: '#1f2937', opacity: 0.75 },
  dot: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#fff', borderWidth: 3, borderColor: INDIGO,
  },
  dotOn: { backgroundColor: INDIGO, borderColor: '#fff' },
  hintWrap: { position: 'absolute', top: 8, alignSelf: 'flex-start', marginStart: 10 },
  hint: {
    fontSize: 11, fontWeight: '600', lineHeight: 16, color: '#92400E',
    backgroundColor: 'rgba(254,243,199,0.96)',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, overflow: 'hidden',
  },
  primary: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: INDIGO, paddingVertical: 14, alignItems: 'center',
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 20 },
  stepRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 12, paddingHorizontal: 4,
  },
  stepBtn: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff',
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  stepGlyph: { fontSize: 26, lineHeight: 30, fontWeight: '700', color: INDIGO },
  stepLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '600', lineHeight: 20, color: '#111827' },
  readout: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: '#111827', marginTop: 12 },
  readoutSmall: { fontSize: 12, lineHeight: 17, color: '#6B7280', marginTop: 2 },
  problem: { fontSize: 13, lineHeight: 19, fontWeight: '700', color: RED, marginTop: 8 },
  problemAt: { fontSize: 12, lineHeight: 17, color: RED, marginTop: 2 },
  hintLine: { fontSize: 12, lineHeight: 18, color: '#6B7280', marginTop: 8 },
});
