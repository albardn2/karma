import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView, { Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { ThemedText } from '@/components/ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { areaColour } from '@/utils/areaColour';
import { parseWktPolygons, polygonsCoverPoint, LatLng } from '@/utils/wkt';

interface ServiceArea {
  uuid: string;
  name: string;
  geometry?: string | null;
}

interface Shape {
  uuid: string;
  name: string;
  coordinates: LatLng[];
  holes: LatLng[][];
  colour: string;
  covers: boolean;
}

/** The list DTO caps per_page at 100, and 101 is a hard 422 rather than a clamp. */
const PER_PAGE = 100;

/**
 * Every service area at once, on one map.
 *
 * This is the module's other view rather than another screen, because it answers a
 * question the list cannot: where these areas are, and whether they overlap. This
 * corpus contains overlapping and nested pairs and nothing anywhere detects either, so
 * being able to see it is the entire feature.
 *
 * COLOUR IS KEYED ON THE UUID, not on the row's position. Position colouring — which
 * the web map does and this component's first version copied — means an area changes
 * colour whenever the result set changes, so it can never agree with the list beside
 * it. Sharing utils/areaColour makes "the teal one in the list" the teal one here.
 *
 * IT SENDS EXACTLY ONE QUERY PARAM. The list DTO forbids extras, so a stray
 * `is_deleted=false` would 422 the whole request rather than being ignored, and
 * `per_page=101` is a 422 too. One hardcoded `per_page=100` and nothing else.
 *
 * NO CALLOUTS, deliberately. The web builds its polygon popups by interpolating the
 * area's name and description straight into `bindPopup` HTML — unescaped tenant text
 * into the DOM. Tapping here navigates to the detail screen, which renders both as
 * ordinary Text. That is less work and also safe.
 *
 * NO WRITE-BACK INTO THE LIST'S FILTERS. The web's map writes its viewport bounds into
 * the same filter object the list query reads, so one visit to its map tab leaves the
 * list silently bbox-filtered for the rest of the session — and the empty state then
 * blames the filters. This component's viewport is its own business.
 *
 * The "covers you" highlight is computed locally with the same ray-cast the server
 * answers `intersects_polygon` with, so the map and the list's own chip cannot
 * contradict each other. It needs no request: the rings are already in hand.
 */
export function ServiceAreasMap({ footerOffset = 0 }: { footerOffset?: number }) {
  const router = useRouter();
  const { t } = useLanguage();
  const mapRef = useRef<MapView | null>(null);

  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [total, setTotal] = useState(0);
  const [me, setMe] = useState<LatLng | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const res = await apiCall<{ items?: ServiceArea[]; total_count?: number }>(
      `/service-area/?per_page=${PER_PAGE}`,
    );
    if (isOk(res.status)) {
      setAreas(res.data?.items ?? []);
      setTotal(Number(res.data?.total_count ?? 0));
    } else {
      setFailed(true);
      setAreas([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // best-effort and silent: a denied permission just means no highlight, and this
  // component must not nag for a location it can do without
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (alive) setMe({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {
        /* no highlight */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const shapes = useMemo<Shape[]>(() => {
    const out: Shape[] = [];
    for (const a of areas) {
      const rings = parseWktPolygons(a.geometry ?? '');
      // an area whose geometry will not parse is dropped rather than drawn empty: a
      // missing shape beats a shape that claims to cover nowhere. The list marks the
      // same rows with AREA_NO_SHAPE so the two views agree about what is undrawable.
      if (!rings.length) continue;
      const covers = me ? polygonsCoverPoint(rings, me) : false;
      for (const r of rings) {
        out.push({
          uuid: a.uuid,
          name: a.name,
          coordinates: r.coordinates,
          holes: r.holes,
          colour: areaColour(a.uuid),
          covers,
        });
      }
    }
    return out;
  }, [areas, me]);

  const allPoints = useMemo(() => shapes.flatMap((s) => s.coordinates), [shapes]);
  const undrawable = areas.length - new Set(shapes.map((s) => s.uuid)).size;

  const fit = useCallback(() => {
    if (!allPoints.length) return;
    mapRef.current?.fitToCoordinates(allPoints, {
      edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
      animated: false,
    });
  }, [allPoints]);

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color="#5469D4" />
      </View>
    );
  }
  if (failed) {
    return (
      <View style={styles.centre}>
        <ThemedText style={styles.stateText}>{t('moduleList.failed')}</ThemedText>
        <TouchableOpacity style={styles.retry} onPress={load}>
          <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
        </TouchableOpacity>
      </View>
    );
  }
  if (!shapes.length) {
    return (
      <View style={styles.centre}>
        <ThemedText style={styles.stateText}>{t('serviceAreas.mapEmpty')}</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <MapView
        ref={mapRef}
        style={styles.flex}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        onLayout={fit}
        showsUserLocation={!!me}
        testID="sa-map"
      >
        {shapes.map((s, i) => (
          <Polygon
            key={`${s.uuid}-${i}`}
            coordinates={s.coordinates}
            holes={s.holes.length ? s.holes : undefined}
            strokeColor={s.colour}
            // the area the user is standing in reads heavier, which is the one fact a
            // driver looking at this screen actually wants
            fillColor={`${s.colour}${s.covers ? '5C' : '29'}`}
            strokeWidth={s.covers ? 4 : 2}
            tappable
            // the polygon's identity is in the closure, so this needs no coordinate
            // from the event — just as well, since a polygon press carries none on
            // iOS with the Google provider
            onPress={() => router.push(`/service-areas/${s.uuid}`)}
          />
        ))}
      </MapView>

      {/* floated over the map rather than laid out below it: the host's bottom
          navigation is position:absolute, so a footer in normal flow sits underneath it.
          Keeping the map full-bleed is also just better on a map. */}
      <View style={[styles.footer, { bottom: footerOffset }]}>
        <ThemedText style={styles.footerText} testID="sa-map-count">
          {t('serviceAreas.mapCount', { count: String(new Set(shapes.map((s) => s.uuid)).size) })}
        </ThemedText>
        {!!undrawable && (
          <ThemedText style={styles.footerText}>
            {t('serviceAreas.mapUndrawable', { count: String(undrawable) })}
          </ThemedText>
        )}
        {total > PER_PAGE && (
          <ThemedText style={styles.footerText}>{t('serviceAreas.mapTruncated')}</ThemedText>
        )}
        <ThemedText style={styles.footerHint}>{t('serviceAreas.mapTapHint')}</ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateText: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  retry: {
    backgroundColor: '#5469D4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  footerText: { fontSize: 11, lineHeight: 15, color: '#6B7280' },
  footerHint: { fontSize: 11, lineHeight: 15, color: '#9CA3AF' },
});
