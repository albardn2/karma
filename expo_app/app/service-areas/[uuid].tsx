import React, { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import MapView, { Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import { useLocalSearchParams } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatNumericDate } from '@/utils/date';
import { parseWktPolygons, LatLng } from '@/utils/wkt';

interface ServiceArea {
  uuid: string;
  name: string;
  description?: string | null;
  /** WKT POLYGON, "lon lat" pairs */
  geometry?: string | null;
  created_at: string;
}

/** Fit a region around every ring, with a little breathing room. */
function regionFor(points: LatLng[]) {
  if (!points.length) return null;
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    // a degenerate area (all points equal) would give a zero span and a blank map
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.01),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.01),
  };
}

/**
 * One service area, drawn rather than described.
 *
 * The geometry is a WKT POLYGON and the raw string is never shown — it is thousands of
 * characters of coordinate pairs, which tells a driver nothing. `parseWktPolygons`
 * handles the lon/lat transposition (WKT is "x y") and tolerates MULTIPOLYGON.
 *
 * If the geometry fails to parse the map is omitted rather than rendered empty, so a
 * blank rectangle never implies "this area covers nowhere".
 */
export default function ServiceAreaDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const { t } = useLanguage();

  return (
    <ModuleDetailScreen<ServiceArea>
      module="service-areas"
      title={t('menu.serviceAreas')}
      endpoint={`/service-area/${uuid}`}
      heading={(a) => a.name}
      rows={(a): DetailRow[] => [
        [t('serviceAreas.description'), a.description || '—'],
        [
          t('serviceAreas.created'),
          a.created_at ? formatNumericDate(new Date(a.created_at)) : '—',
        ],
      ]}
      sections={[
        {
          title: t('serviceAreas.area'),
          isEmpty: (a) => !parseWktPolygons(a.geometry ?? '').length,
          emptyText: t('serviceAreas.noGeometry'),
          render: (a) => <AreaMap geometry={a.geometry ?? ''} />,
        },
      ]}
    />
  );
}

function AreaMap({ geometry }: { geometry: string }) {
  const { t } = useLanguage();
  const rings = useMemo(() => parseWktPolygons(geometry), [geometry]);
  const region = useMemo(
    () => regionFor(rings.flatMap((r) => r.coordinates)),
    [rings],
  );
  if (!region) return null;

  return (
    <View style={styles.mapWrap}>
      <MapView
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={region}
        pointerEvents="none"
      >
        {rings.map((r, i) => (
          <Polygon
            key={i}
            coordinates={r.coordinates}
            holes={r.holes.length ? r.holes : undefined}
            fillColor="rgba(84,105,212,0.16)"
            strokeColor="rgba(84,105,212,0.85)"
            strokeWidth={2}
            tappable={false}
          />
        ))}
      </MapView>
      {rings.length > 1 && (
        <ThemedText style={styles.hint}>{t('serviceAreas.parts', { count: rings.length })}</ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  mapWrap: { gap: 6 },
  map: { height: 220, borderRadius: 10, overflow: 'hidden' },
  hint: { fontSize: 11, opacity: 0.5 },
});
