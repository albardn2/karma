import React, { useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import MapView, { Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ThemedText } from '@/components/ThemedText';
import { ModuleDetailScreen, DetailAction, DetailRow } from '@/components/ModuleDetailScreen';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useHasEndpoint } from '@/hooks/useModuleAccess';
import { apiCall, isOk } from '@/utils/api';
import { formatNumericDate } from '@/utils/date';
import {
  formatKm2,
  parseWktPolygons,
  regionFor,
  ringAreaM2,
  ringVertexCount,
} from '@/utils/wkt';

interface ServiceArea {
  uuid: string;
  name: string;
  description?: string | null;
  /** WKT POLYGON, "lon lat" pairs */
  geometry?: string | null;
  created_at: string;
}

/**
 * One service area, drawn rather than described.
 *
 * The geometry is a WKT POLYGON and the raw string is never shown as a row — it is about
 * a kilobyte of coordinate pairs, which tells a driver nothing. `parseWktPolygons`
 * handles the lon/lat transposition (WKT is "x y") and tolerates MULTIPOLYGON. If the
 * geometry fails to parse the map is omitted rather than rendered empty, so a blank
 * rectangle never implies "this area covers nowhere".
 *
 * POINT COUNT AND APPROXIMATE SIZE ARE ON SCREEN because they are the only way to tell a
 * boundary someone surveyed from a circle someone generated on a phone. The API has no
 * provenance field — the read model is seven keys and any extra one is refused — so
 * "48 points, ≈12.5 km²" is the whole available signal, and it is the same signal that
 * tells someone their circle is the wrong size.
 *
 * WHY THERE IS NO BOUNDARY EDITOR HERE. Nine of the eleven real areas in this database
 * have adjacent vertices closer than a 44pt touch target once fitted to a phone screen,
 * and this API has no undo of any kind. Offering handles would mean offering to corrupt
 * a surveyed boundary with no way back. `Copy boundary` is the honest alternative: it is
 * the bridge to the web app's draw tool, which is where a shape actually gets fixed, and
 * it is the one field on the web's six-copy-button sidebar that a person cannot retype.
 *
 * The map stays `pointerEvents="none"`. It is nested inside the scaffold's vertical
 * ScrollView, and a pinch-zoom inside a vertical scroll is a gesture conflict this
 * screen does not need to take on — the all-areas map screen is where panning lives.
 */
export default function ServiceAreaDetailScreen() {
  const { uuid } = useLocalSearchParams<{ uuid: string }>();
  const router = useRouter();
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);

  // writes here are admin-only at the route regardless of the permission checklist,
  // so both conditions must hold or the button can only ever produce a 403
  const canUpdate = useHasEndpoint('service_area', 'update') && isAdmin;
  const canDelete = useHasEndpoint('service_area', 'delete') && isAdmin;

  const outerOf = (a: ServiceArea) =>
    parseWktPolygons(a.geometry ?? '')[0]?.coordinates ?? [];

  const remove = async () => {
    const res = await apiCall(`/service-area/${uuid}`, { method: 'DELETE' });
    if (isOk(res.status)) {
      router.back();
      return;
    }
    Alert.alert(
      t('detail.delete'),
      String(res.error ?? '').slice(0, 300) || t('serviceAreas.deleteFailed'),
    );
  };

  const rows = (a: ServiceArea): DetailRow[] => {
    const outer = outerOf(a);
    return [
      [t('serviceAreas.description'), a.description || '—'],
      [
        t('serviceAreas.created'),
        a.created_at ? formatNumericDate(new Date(a.created_at)) : '—',
      ],
      [t('serviceAreas.points'), outer.length ? String(ringVertexCount(outer)) : '—'],
      [
        t('serviceAreas.size'),
        outer.length
          ? t('serviceAreas.areaSize', { km2: formatKm2(ringAreaM2(outer) / 1e6) })
          : '—',
      ],
    ];
  };

  const actions: DetailAction<ServiceArea>[] = [
    {
      label: t('detail.edit'),
      testID: 'service-area-edit',
      visible: () => canUpdate,
      onPress: (a) => {
        setReloadKey((k) => k + 1);
        router.push({
          pathname: '/service-areas/edit',
          params: { uuid: a.uuid, name: a.name, description: a.description ?? '' },
        });
      },
    },
    {
      // #106 said the boundary could not be changed from the app. That was wrong about
      // the API — PUT accepts geometry — so here is the editor.
      label: t('serviceAreas.boundaryTitle'),
      testID: 'service-area-boundary',
      visible: () => canUpdate,
      onPress: (a) => {
        setReloadKey((k) => k + 1);
        router.push({ pathname: '/service-areas/boundary', params: { uuid: a.uuid } });
      },
    },
    {
      label: t('serviceAreas.copyBoundary'),
      testID: 'service-area-copy',
      visible: (a) => !!a.geometry,
      onPress: async (a) => {
        // the raw canonical string from the GET, never a re-serialised one
        await Clipboard.setStringAsync(a.geometry ?? '');
        Alert.alert(t('serviceAreas.copied'));
      },
    },
    {
      label: t('detail.delete'),
      destructive: true,
      testID: 'service-area-delete',
      visible: () => canDelete,
      // the default "this cannot be undone" understates it by two facts: the name is
      // globally unique with no is_deleted predicate so it stays reserved for ever,
      // and trip filters for this area stop resolving afterwards
      confirmText: (a) => t('serviceAreas.deleteConfirm', { name: a.name }),
      onPress: remove,
    },
  ];

  return (
    <ModuleDetailScreen<ServiceArea>
      module="service-areas"
      title={t('menu.serviceAreas')}
      endpoint={`/service-area/${uuid}`}
      reloadKey={reloadKey}
      heading={(a) => a.name}
      rows={rows}
      actions={actions}
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
