import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Stack, useRouter } from 'expo-router';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { ModuleGuard } from '@/components/ModuleGuard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall, isOk } from '@/utils/api';
// `type` on MqttMessage is load-bearing: it is an interface, so without it Babel keeps
// a named value import that does not exist at runtime, the module throws while loading,
// and expo-router reports the route as "This screen does not exist" — which sends you
// looking for a routing problem instead of an import one.
import { MqttSubscriber, type MqttMessage } from '@/utils/mqttSubscriber';

interface ClientConfig {
  broker_ws_url: string;
  topic_prefix: string;
  user_uuid: string;
}

interface Position {
  userUuid: string;
  username: string;
  lat: number;
  lon: number;
  /** when the device says it took the fix */
  recordedAt: number | null;
  speed?: number;
  /** when this app received it — the only clock we can trust */
  receivedAt: number;
}

type Status = 'connecting' | 'connected' | 'closed' | 'error';

/**
 * A position older than this is drawn as stale rather than current.
 *
 * The publisher sets retain = true, so the broker hands a new subscriber the LAST
 * position of every user in the tenant the instant it connects — including someone who
 * finished their shift yesterday. Without an age, a retained fix is indistinguishable
 * from a live one, and a map that confidently shows a driver who is not there is worse
 * than a map that shows nothing.
 */
const STALE_AFTER_MS = 5 * 60 * 1000;

/** Redraw ages on a timer; nothing else re-renders them. */
const AGE_TICK_MS = 5000;

const RECONNECT_MS = [1000, 2000, 4000, 8000, 15000];

/**
 * Parse a published position. Deliberately strict: a bad frame is dropped, not guessed.
 *
 * `coordinates` is "LAT,LON" here — the opposite order from the WKT the service-area
 * screens deal in, where it is "lon lat". Getting it backwards puts Damascus drivers in
 * the Indian Ocean, and nothing errors.
 */
function parsePosition(payload: string): Omit<Position, 'receivedAt'> | null {
  try {
    const data = JSON.parse(payload);
    if (!data || typeof data !== 'object') return null;
    if (typeof data.user_uuid !== 'string' || !data.user_uuid) return null;
    if (typeof data.coordinates !== 'string') return null;
    const parts = data.coordinates.split(',');
    if (parts.length !== 2) return null;
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    const recorded = Date.parse(String(data.recorded_at ?? ''));
    return {
      userUuid: data.user_uuid,
      username:
        typeof data.username === 'string' && data.username
          ? data.username
          : data.user_uuid.slice(0, 8),
      lat,
      lon,
      recordedAt: Number.isFinite(recorded) ? recorded : null,
      speed:
        typeof data.speed === 'number' && isFinite(data.speed) && data.speed >= 0
          ? data.speed
          : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Where the drivers are.
 *
 * There is no REST endpoint for current positions — none of the /location routes is a
 * latest-position query — so this is an MQTT screen, not a list screen. It subscribes to
 * `{topic_prefix}/+` from GET /location/client-config.
 *
 * That wildcard is safe now and was not always: the prefix used to be per ENVIRONMENT,
 * so one tenant's wildcard received every other tenant's drivers. It is per ACCOUNT
 * today, which is what makes this screen buildable without a client-side tenant filter
 * standing in for access control.
 *
 * The subscriber has no internal retry, so reconnecting means constructing a new
 * instance — hence the ref juggling rather than a single long-lived object.
 *
 * `live-map` appears in no role preset, so in practice only admins (whose granted
 * modules are null, meaning unrestricted) see the tile. That is deliberate for now: an
 * operation manager is arguably the right audience, but granting it is a product
 * decision about every tenant rather than something to slip in with a screen.
 */
export default function LiveMapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [status, setStatus] = useState<Status>('connecting');
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [failed, setFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const clientRef = useRef<MqttSubscriber | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposedRef = useRef(false);

  // ages are time-derived, so nothing else would re-render them
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), AGE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const onMessage = useCallback((msg: MqttMessage) => {
    const p = parsePosition(msg.payload);
    if (!p) return;
    setPositions((prev) => ({ ...prev, [p.userUuid]: { ...p, receivedAt: Date.now() } }));
  }, []);

  const connect = useCallback(
    async (cfg: ClientConfig) => {
      if (disposedRef.current) return;
      setStatus('connecting');
      const client = new MqttSubscriber({
        url: cfg.broker_ws_url,
        // a colliding client id makes the broker drop the other session
        clientId: `karma-app-${cfg.user_uuid.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`,
        onMessage,
        onStatus: (s) => {
          if (disposedRef.current) return;
          setStatus(s);
          if (s === 'connected') {
            attemptRef.current = 0;
            client.subscribe(`${cfg.topic_prefix}/+`);
          } else if (s === 'closed' || s === 'error') {
            // no internal retry: build a fresh instance, backing off
            const delay = RECONNECT_MS[Math.min(attemptRef.current, RECONNECT_MS.length - 1)];
            attemptRef.current += 1;
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => connect(cfg), delay);
          }
        },
      });
      clientRef.current = client;
      try {
        await client.connect();
      } catch {
        /* onStatus('error') already scheduled the retry */
      }
    },
    [onMessage],
  );

  useEffect(() => {
    disposedRef.current = false;
    (async () => {
      const res = await apiCall<ClientConfig>('/location/client-config');
      if (!isOk(res.status) || !res.data?.broker_ws_url || !res.data?.topic_prefix) {
        setFailed(true);
        setStatus('error');
        return;
      }
      connect(res.data);
    })();
    return () => {
      disposedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      clientRef.current?.close();
    };
  }, [connect]);

  const drivers = useMemo(
    () =>
      Object.values(positions).sort((a, b) => {
        const stale = (p: Position) => (now - p.receivedAt > STALE_AFTER_MS ? 1 : 0);
        return stale(a) - stale(b) || a.username.localeCompare(b.username);
      }),
    [positions, now],
  );

  const region = useMemo(() => {
    if (!drivers.length) return null;
    const lats = drivers.map((d) => d.lat);
    const lons = drivers.map((d) => d.lon);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      // a single driver would give a zero span and a blank map
      latitudeDelta: Math.max((maxLat - minLat) * 1.5, 0.02),
      longitudeDelta: Math.max((maxLon - minLon) * 1.5, 0.02),
    };
    // only re-fit when the set of drivers changes, not on every age tick
  }, [drivers.length, positions]);

  const age = (p: Position) => {
    const secs = Math.max(0, Math.round((now - p.receivedAt) / 1000));
    if (secs < 60) return t('liveMap.secondsAgo', { n: secs });
    const mins = Math.round(secs / 60);
    if (mins < 60) return t('liveMap.minutesAgo', { n: mins });
    return t('liveMap.hoursAgo', { n: Math.round(mins / 60) });
  };

  const isStale = (p: Position) => now - p.receivedAt > STALE_AFTER_MS;

  return (
    <ModuleGuard module="live-map">
      <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />

        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} testID="live-map-back">
            <ThemedText style={styles.back}>‹</ThemedText>
          </TouchableOpacity>
          <ThemedText style={styles.topTitle} numberOfLines={1}>
            {t('menu.liveMap')}
          </ThemedText>
          <View style={styles.backSpacer} />
        </View>

        <View style={styles.statusRow}>
          <View
            style={[
              styles.dot,
              status === 'connected'
                ? styles.dotOn
                : status === 'connecting'
                  ? styles.dotWait
                  : styles.dotOff,
            ]}
          />
          <ThemedText style={styles.statusText} testID="live-map-status">
            {failed
              ? t('liveMap.noConfig')
              : status === 'connected'
                ? t('liveMap.live', { count: drivers.length })
                : status === 'connecting'
                  ? t('liveMap.connecting')
                  : t('liveMap.reconnecting')}
          </ThemedText>
        </View>

        <View style={styles.mapWrap}>
          {region ? (
            <MapView
              style={StyleSheet.absoluteFill}
              provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
              initialRegion={region}
            >
              {drivers.map((d) => (
                <Marker
                  key={d.userUuid}
                  coordinate={{ latitude: d.lat, longitude: d.lon }}
                  title={d.username}
                  description={`${age(d)}${d.speed != null ? ` · ${Math.round(d.speed * 3.6)} km/h` : ''}`}
                  opacity={isStale(d) ? 0.45 : 1}
                  testID={`live-marker-${d.userUuid}`}
                />
              ))}
            </MapView>
          ) : (
            <View style={styles.centre}>
              <ThemedText style={styles.stateText}>
                {failed ? t('moduleList.failed') : t('liveMap.waiting')}
              </ThemedText>
            </View>
          )}
        </View>

        <View style={[styles.list, { paddingBottom: 12 + insets.bottom }]}>
          {drivers.slice(0, 6).map((d) => (
            <View key={d.userUuid} style={styles.row}>
              <ThemedText style={[styles.name, isStale(d) && styles.dim]} numberOfLines={1}>
                {d.username}
              </ThemedText>
              <ThemedText style={[styles.age, isStale(d) && styles.staleAge]}>
                {age(d)}
                {isStale(d) ? ` · ${t('liveMap.stale')}` : ''}
              </ThemedText>
            </View>
          ))}
          {drivers.length > 6 && (
            <ThemedText style={styles.more}>
              {t('liveMap.andMore', { n: drivers.length - 6 })}
            </ThemedText>
          )}
        </View>
      </ThemedView>
    </ModuleGuard>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 30, lineHeight: 34, color: '#5469D4', fontWeight: '700' },
  backSpacer: { width: 24 },
  topTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: '#16a34a' },
  dotWait: { backgroundColor: '#d97706' },
  dotOff: { backgroundColor: '#dc2626' },
  statusText: { fontSize: 12, opacity: 0.7 },
  mapWrap: { flex: 1, marginHorizontal: 20, borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  stateText: { fontSize: 14, opacity: 0.6, textAlign: 'center' },
  list: { paddingHorizontal: 20, paddingTop: 10, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flex: 1, fontSize: 14, fontWeight: '600', color: '#1f2937' },
  dim: { opacity: 0.5 },
  age: { fontSize: 11, opacity: 0.6 },
  staleAge: { color: '#b45309', opacity: 0.9 },
  more: { fontSize: 11, opacity: 0.5 },
});
