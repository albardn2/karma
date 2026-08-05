import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView, { Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
import { parseWktPolygons, LatLng } from '@/utils/wkt';

interface ServiceArea {
  uuid: string;
  name: string;
  geometry?: string | null;
}

/** One ring, ready to draw, carrying the area it came from. */
interface Shape {
  uuid: string;
  name: string;
  coordinates: LatLng[];
  holes: LatLng[][];
  colour: string;
}

const PALETTE = ['#5469D4', '#0E9F6E', '#D97706', '#DC2626', '#7C3AED', '#0891B2'];

/** The list DTO caps per_page at 100, and 101 is a hard 422 rather than a clamp. */
const PER_PAGE = 100;

/**
 * Every service area at once, on one map.
 *
 * The list answers "what areas exist"; this answers "where are they, and do they overlap"
 * — which is the question that made the web app grow a map tab, and the one a table
 * cannot answer at all. The corpus already contains overlapping and nested pairs and
 * nothing anywhere detects either, so being able to see it is the whole feature.
 *
 * IT SENDS EXACTLY ONE QUERY PARAM. The list DTO forbids extras, so a stray
 * `is_deleted=false` would 422 the entire request rather than being ignored, and
 * `per_page=101` is a 422 too. One hardcoded `per_page=100`, nothing else.
 *
 * NO POPUPS, deliberately. The web builds its polygon popups by interpolating the area's
 * name and description straight into HTML — unescaped tenant-authored text into the DOM.
 * Tapping here navigates to the detail screen, which renders both as ordinary Text. That
 * is not extra work, it is less work that also happens to be safe.
 *
 * NO WRITE-BACK INTO THE LIST'S FILTERS. The web's map writes the viewport bounds into
 * the same filter object the list query reads, so one visit to its map tab leaves the
 * list silently bbox-filtered for the rest of the session — and its empty state then
 * blames the filters. This screen's viewport is its own business.
 *
 * The view is fitted to the areas rather than centred on a fixed city, which is what
 * makes the web version hide anything outside its default viewport.
 */
export default function ServiceAreasMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const mapRef = useRef<MapView | null>(null);

  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [total, setTotal] = useState(0);
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

  // an area whose geometry will not parse is dropped rather than drawn empty: a
  // missing shape is better than a shape that claims to cover nowhere
  const shapes = useMemo<Shape[]>(() => {
    const out: Shape[] = [];
    areas.forEach((a, i) => {
      const rings = parseWktPolygons(a.geometry ?? '');
      rings.forEach((r) =>
        out.push({
          uuid: a.uuid,
          name: a.name,
          coordinates: r.coordinates,
          holes: r.holes,
          colour: PALETTE[i % PALETTE.length],
        }),
      );
    });
    return out;
  }, [areas]);

  const allPoints = useMemo(() => shapes.flatMap((s) => s.coordinates), [shapes]);

  const fit = useCallback(() => {
    if (!allPoints.length) return;
    mapRef.current?.fitToCoordinates(allPoints, {
      edgePadding: { top: 60, right: 40, bottom: 60, left: 40 },
      animated: false,
    });
  }, [allPoints]);

  return (
    <ModuleGuard module="service-areas">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="sa-map-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('serviceAreas.mapView')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        {loading ? (
          <View style={styles.centre}>
            <ActivityIndicator size="large" color="#5469D4" />
          </View>
        ) : failed ? (
          <View style={styles.centre}>
            <ThemedText style={styles.stateText}>{t('moduleList.failed')}</ThemedText>
            <TouchableOpacity style={styles.retry} onPress={load}>
              <ThemedText style={styles.retryText}>{t('moduleList.retry')}</ThemedText>
            </TouchableOpacity>
          </View>
        ) : !shapes.length ? (
          <View style={styles.centre}>
            <ThemedText style={styles.stateText}>{t('serviceAreas.mapEmpty')}</ThemedText>
          </View>
        ) : (
          <View style={styles.flex}>
            <MapView
              ref={mapRef}
              style={styles.flex}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              onLayout={fit}
              testID="sa-map"
            >
              {shapes.map((s, i) => (
                <Polygon
                  key={`${s.uuid}-${i}`}
                  coordinates={s.coordinates}
                  holes={s.holes.length ? s.holes : undefined}
                  strokeColor={s.colour}
                  fillColor={`${s.colour}29`}
                  strokeWidth={2}
                  tappable
                  // the polygon's identity is in the closure, so this needs no
                  // coordinate from the event — which is just as well, since a
                  // polygon press carries none on iOS with the Google provider
                  onPress={() => router.push(`/service-areas/${s.uuid}`)}
                />
              ))}
            </MapView>
            <View style={[styles.footer, { paddingBottom: 10 + insets.bottom }]}>
              <ThemedText style={styles.footerText} testID="sa-map-count">
                {t('serviceAreas.mapCount', { count: String(areas.length) })}
              </ThemedText>
              {total > PER_PAGE && (
                <ThemedText style={styles.footerText}>
                  {t('serviceAreas.mapTruncated')}
                </ThemedText>
              )}
            </View>
          </View>
        )}
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
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  stateText: { fontSize: 14, opacity: 0.6, textAlign: 'center' },
  retry: {
    backgroundColor: '#5469D4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  retryText: { color: '#fff', fontWeight: '600' },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  footerText: { fontSize: 11, opacity: 0.6 },
});
