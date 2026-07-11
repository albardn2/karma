import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import type { PolygonRings } from '@/utils/wkt';

export interface TripMapStop {
  taskExecutionUuid: string;
  tripStopUuid: string;
  customerName: string;
  status: string;
  lat: number | null;
  lng: number | null;
  index: number;
}

// a service area drawn as translucent polygon(s) under the stop pins
export interface TripMapArea {
  uuid: string;
  name: string;
  polygons: PolygonRings[];
}

const statusColor = (status: string, isCurrent: boolean) => {
  if (isCurrent) return '#5469D4';
  if (status === 'completed') return '#16a34a';
  if (status === 'cancelled' || status === 'failed') return '#dc2626';
  return '#9ca3af';
};

// Damascus fallback (matches the rest of the app)
const DEFAULT_REGION: Region = {
  latitude: 33.5138,
  longitude: 36.2765,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

export function TripMap({
  stops,
  currentStopUuid,
  onStopPress,
  armedStopUuid = null,
  onArm,
  onSetCurrent,
  areas = [],
}: {
  stops: TripMapStop[];
  currentStopUuid: string | null;
  onStopPress: (stop: TripMapStop) => void;
  armedStopUuid?: string | null;
  onArm?: (uuid: string | null) => void;
  onSetCurrent?: (stop: TripMapStop) => void;
  areas?: TripMapArea[];
}) {
  const mapRef = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  // On iOS (Apple provider) a marker tap ALSO fires MapView.onPress, which would
  // instantly clear the arm we just set. Record when a marker was tapped so the
  // map's onPress can ignore that paired event and only dismiss on a real
  // background tap.
  const lastMarkerTapRef = useRef(0);

  const pinned = useMemo(() => stops.filter((s) => s.lat != null && s.lng != null), [stops]);
  const current = useMemo(
    () => pinned.find((s) => s.tripStopUuid === currentStopUuid) || pinned[0] || null,
    [pinned, currentStopUuid]
  );
  // the upcoming stop the user tapped → shows a floating "Set current" button
  const armedStop = useMemo(
    () =>
      pinned.find(
        (s) =>
          s.taskExecutionUuid === armedStopUuid &&
          s.status === 'not_started' &&
          s.tripStopUuid !== currentStopUuid
      ) || null,
    [pinned, armedStopUuid, currentStopUuid]
  );

  const initialRegion = useMemo<Region>(() => {
    if (current && current.lat != null && current.lng != null) {
      return { latitude: current.lat, longitude: current.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 };
    }
    return DEFAULT_REGION;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only for the very first frame; recentering happens imperatively below

  // react-native-maps ignores initialRegion after mount, so recenter imperatively
  // once the map is ready and the stops/current stop resolve.
  useEffect(() => {
    if (!ready || !mapRef.current) return;
    if (current && current.lat != null && current.lng != null) {
      mapRef.current.animateToRegion(
        { latitude: current.lat, longitude: current.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 },
        500
      );
    } else if (pinned.length > 0) {
      mapRef.current.fitToCoordinates(
        pinned.map((s) => ({ latitude: s.lat as number, longitude: s.lng as number })),
        { edgePadding: { top: 90, right: 80, bottom: 280, left: 80 }, animated: true }
      );
    } else if (areas.length > 0) {
      // no stops yet (fresh manual trip) — frame the picked service areas
      mapRef.current.fitToCoordinates(
        areas.flatMap((a) => a.polygons.flatMap((p) => p.coordinates)),
        { edgePadding: { top: 90, right: 80, bottom: 280, left: 80 }, animated: true }
      );
    }
  }, [ready, current?.tripStopUuid, current?.lat, current?.lng, pinned.length, areas.length]);

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        onMapReady={() => setReady(true)}
        onPress={() => {
          // ignore the map press that iOS pairs with a marker tap; only a
          // genuine background tap (no recent marker tap) dismisses.
          if (Date.now() - lastMarkerTapRef.current < 350) return;
          onArm?.(null);
        }}
        showsUserLocation
        showsMyLocationButton
        loadingEnabled
      >
        {/* picked service-area boundaries, under the stop pins */}
        {areas.map((a) =>
          a.polygons.map((p, i) => (
            <Polygon
              key={`${a.uuid}:${i}`}
              coordinates={p.coordinates}
              holes={p.holes.length ? p.holes : undefined}
              fillColor="rgba(84,105,212,0.16)"
              strokeColor="rgba(84,105,212,0.85)"
              strokeWidth={2}
              tappable={false}
            />
          ))
        )}

        {pinned.map((s) => {
          const isCurrent = s.tripStopUuid === currentStopUuid;
          return (
            <Marker
              // Key every marker on the current stop id so ALL markers remount
              // whenever the current stop changes. react-native-maps on the iOS
              // (Apple) provider does NOT reliably redraw a custom marker view
              // when its props change in place (the promoted pin stays gray /
              // vanishes), so we force a fresh render — which works on mount.
              key={`${s.taskExecutionUuid}:${currentStopUuid ?? 'none'}`}
              coordinate={{ latitude: s.lat as number, longitude: s.lng as number }}
              title={s.customerName}
              description={isCurrent ? 'Current stop' : s.status}
              // keep the current (blue) pin on top; stops render in chain order,
              // so an early-drawn current pin would otherwise be hidden under the
              // later upcoming pins in a dense cluster.
              zIndex={isCurrent ? 999 : 1}
              onPress={() => {
                lastMarkerTapRef.current = Date.now();
                const upcoming = s.status === 'not_started' && !isCurrent;
                if (upcoming) onArm?.(s.taskExecutionUuid);
                else { onArm?.(null); onStopPress(s); }
              }}
            >
              <View style={[styles.pin, { backgroundColor: statusColor(s.status, isCurrent) }, isCurrent && styles.pinCurrent]}>
                <View style={styles.pinInner} />
              </View>
            </Marker>
          );
        })}
      </MapView>

      {/* floating "Set current" for a tapped upcoming pin; taps elsewhere on the
          map dismiss it via the MapView onPress above */}
      {armedStop && (
        <View style={styles.armedWrap} pointerEvents="box-none">
          <View style={styles.armedCard}>
            <Text style={styles.armedName} numberOfLines={1}>{armedStop.customerName}</Text>
            <TouchableOpacity
              style={styles.armedBtn}
              onPress={() => { onSetCurrent?.(armedStop); onArm?.(null); }}
              testID={`map-set-current-${armedStop.tripStopUuid}`}
            >
              <Text style={styles.armedBtnText}>Set current</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pin: {
    width: 26, height: 26, borderRadius: 13, borderWidth: 3, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
  },
  pinCurrent: { width: 32, height: 32, borderRadius: 16 },
  pinInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  armedWrap: { position: 'absolute', top: 12, left: 0, right: 0, alignItems: 'center' },
  armedCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12,
    paddingLeft: 14, paddingRight: 6, paddingVertical: 6, maxWidth: '90%',
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 6,
  },
  armedName: { fontSize: 14, fontWeight: '600', color: '#111827', marginRight: 10, flexShrink: 1 },
  armedBtn: { backgroundColor: '#5469D4', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  armedBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
