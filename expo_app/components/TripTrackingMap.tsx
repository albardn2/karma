import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { ThemedText } from '@/components/ThemedText';
import { useLanguage } from '@/contexts/LanguageContext';
import { apiCall } from '@/utils/api';
import { MqttSubscriber } from '@/utils/mqttSubscriber';
import type { TripMapStop } from '@/components/TripMap';

// Admin-only live + playback tracking for a trip's assigned user. Mirrors the
// web trip-detail tracking: grey stored path, green live trail, moving marker;
// playback scrubs through the stored series.

interface LatLng {
  latitude: number;
  longitude: number;
}
interface StoredPoint extends LatLng {
  t: number; // ms epoch
}
interface LivePos extends LatLng {
  username?: string;
  speed?: number | null;
  receivedAt: number;
}

const DEFAULT_REGION: Region = {
  latitude: 33.5138,
  longitude: 36.2765,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const SPEEDS = [1, 4, 10, 30];

const toMs = (s: string) => {
  const hasTz = /[zZ]|[+-]\d{2}:?\d{2}$/.test(s);
  return new Date(hasTz ? s : s + 'Z').getTime();
};

const parseLatLng = (s: unknown): LatLng | null => {
  if (typeof s !== 'string') return null;
  const [lat, lng] = s.split(',').map((x) => parseFloat(x.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
};

const fmtClock = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Dependency-free scrub bar (no native slider needed). */
function ScrubBar({
  progress,
  onSeek,
}: {
  progress: number; // 0..1
  onSeek: (p: number) => void;
}) {
  const widthRef = useRef(1);
  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => onSeek(Math.min(1, Math.max(0, e.nativeEvent.locationX / widthRef.current))),
        onPanResponderMove: (e) => onSeek(Math.min(1, Math.max(0, e.nativeEvent.locationX / widthRef.current))),
      }),
    [onSeek]
  );
  return (
    <View
      style={styles.scrubTouch}
      onLayout={(e) => (widthRef.current = Math.max(1, e.nativeEvent.layout.width))}
      {...pan.panHandlers}
    >
      <View style={styles.scrubTrack}>
        <View style={[styles.scrubFill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={[styles.scrubThumb, { left: `${progress * 100}%` }]} />
    </View>
  );
}

export function TripTrackingMap({
  executionUuid,
  assignedValue,
  stops,
  onClose,
}: {
  executionUuid: string;
  /** start_trip result value — a username or a user uuid */
  assignedValue: string | null;
  stops: TripMapStop[];
  onClose: () => void;
}) {
  const { t } = useLanguage();
  const mapRef = useRef<MapView>(null);
  const [mode, setMode] = useState<'live' | 'playback'>('live');

  // ---- resolved identities & data ----
  const [user, setUser] = useState<{ uuid: string; username: string } | null>(null);
  const [userMissing, setUserMissing] = useState(false);
  const [storedPoints, setStoredPoints] = useState<StoredPoint[]>([]);
  const [config, setConfig] = useState<{ broker_ws_url: string; topic_prefix: string } | null>(null);

  // ---- live state ----
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [live, setLive] = useState<LivePos | null>(null);
  const [liveTrail, setLiveTrail] = useState<LatLng[]>([]);
  const [follow, setFollow] = useState(true);
  const followRef = useRef(true);
  const [, setTick] = useState(0); // refresh "last seen" label
  const subRef = useRef<MqttSubscriber | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(5000);

  // ---- playback state ----
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(1); // default 4x
  const [playhead, setPlayhead] = useState(0); // ms epoch

  // resolve the assigned user (value may be a username or a uuid)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!assignedValue) { setUserMissing(true); return; }
      const res = await apiCall<{ users: { uuid: string; username: string }[] }>(
        '/auth/users?per_page=100'
      );
      if (cancelled) return;
      const u = (res.data?.users || []).find(
        (u) => u.uuid === assignedValue || u.username === assignedValue
      );
      if (u) setUser({ uuid: u.uuid, username: u.username });
      else setUserMissing(true);
    })();
    return () => { cancelled = true; };
  }, [assignedValue]);

  // stored trip series (trip uuid ← execution)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const tripRes = await apiCall<{ items: { uuid: string }[] }>(
        `/trip/?workflow_execution_uuid=${executionUuid}&per_page=1`
      );
      const tripUuid = tripRes.data?.items?.[0]?.uuid;
      if (!tripUuid || cancelled) return;
      const res = await apiCall<{ points: { coordinates: string; recorded_at: string }[] }>(
        `/location/trip/${tripUuid}`
      );
      if (cancelled) return;
      const pts = (res.data?.points || [])
        .map((p) => {
          const ll = parseLatLng(p.coordinates);
          return ll ? { ...ll, t: toMs(p.recorded_at) } : null;
        })
        .filter(Boolean) as StoredPoint[];
      pts.sort((a, b) => a.t - b.t);
      setStoredPoints(pts);
      if (pts.length) setPlayhead(pts[0].t);
    })();
    return () => { cancelled = true; };
  }, [executionUuid]);

  // broker config
  useEffect(() => {
    let cancelled = false;
    apiCall<{ broker_ws_url: string; topic_prefix: string }>('/location/client-config').then((res) => {
      if (!cancelled && res.data) setConfig(res.data);
    });
    return () => { cancelled = true; };
  }, []);

  // live "last seen" ages
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // live MQTT subscription
  useEffect(() => {
    if (mode !== 'live' || !config || !user) return;
    let disposed = false;

    const connect = async () => {
      setStatus('connecting');
      const sub = new MqttSubscriber({
        url: config.broker_ws_url,
        clientId: `karma-app-track-${Math.random().toString(36).slice(2, 10)}`,
        onMessage: (msg) => {
          try {
            const data = JSON.parse(msg.payload);
            const ll = parseLatLng(data.coordinates);
            if (!ll) return;
            setLive({
              ...ll,
              username: typeof data.username === 'string' ? data.username : undefined,
              speed: typeof data.speed === 'number' ? data.speed : null,
              receivedAt: Date.now(),
            });
            setLiveTrail((trail) => {
              const last = trail[trail.length - 1];
              if (last && last.latitude === ll.latitude && last.longitude === ll.longitude) return trail;
              return [...trail.slice(-500), ll];
            });
            if (followRef.current && mapRef.current) {
              mapRef.current.animateToRegion(
                { ...ll, latitudeDelta: 0.02, longitudeDelta: 0.02 },
                400
              );
            }
          } catch {
            // malformed payload — ignore
          }
        },
        onStatus: (s) => {
          if (disposed) return;
          if (s === 'connected') {
            setStatus('connected');
            delayRef.current = 5000;
            sub.subscribe(`${config.topic_prefix}/${user.uuid}`);
          } else if (s === 'closed' || s === 'error') {
            setStatus('disconnected');
            if (!reconnectRef.current) {
              const delay = delayRef.current;
              delayRef.current = Math.min(delay * 2, 60000);
              reconnectRef.current = setTimeout(() => {
                reconnectRef.current = null;
                if (!disposed) connect().catch(() => {});
              }, delay);
            }
          }
        },
      });
      subRef.current = sub;
      await sub.connect();
    };

    connect().catch(() => setStatus('disconnected'));
    return () => {
      disposed = true;
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      subRef.current?.close();
      subRef.current = null;
    };
  }, [mode, config, user?.uuid]);

  // playback ticker
  useEffect(() => {
    if (mode !== 'playback' || !playing || storedPoints.length < 2) return;
    const endT = storedPoints[storedPoints.length - 1].t;
    const id = setInterval(() => {
      setPlayhead((ph) => {
        const next = ph + 250 * SPEEDS[speedIdx];
        if (next >= endT) {
          setPlaying(false);
          return endT;
        }
        return next;
      });
    }, 250);
    return () => clearInterval(id);
  }, [mode, playing, speedIdx, storedPoints]);

  // playback: current position + traversed path
  const playbackPos = useMemo<StoredPoint | null>(() => {
    if (!storedPoints.length) return null;
    let cur = storedPoints[0];
    for (const p of storedPoints) {
      if (p.t <= playhead) cur = p;
      else break;
    }
    return cur;
  }, [storedPoints, playhead]);
  const traversed = useMemo(
    () => storedPoints.filter((p) => p.t <= playhead),
    [storedPoints, playhead]
  );

  // keep the map on the playback marker while playing
  useEffect(() => {
    if (mode === 'playback' && playing && playbackPos && mapRef.current && followRef.current) {
      mapRef.current.animateToRegion(
        { latitude: playbackPos.latitude, longitude: playbackPos.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        300
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackPos?.t, playing, mode]);

  // initial framing: stored path, else stops
  const framedRef = useRef(false);
  const frame = () => {
    if (framedRef.current || !mapRef.current) return;
    const coords: LatLng[] = storedPoints.length
      ? storedPoints
      : (stops.filter((s) => s.lat != null && s.lng != null).map((s) => ({
          latitude: s.lat as number,
          longitude: s.lng as number,
        })) as LatLng[]);
    if (coords.length) {
      framedRef.current = true;
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 120, right: 60, bottom: 220, left: 60 },
        animated: true,
      });
    }
  };
  useEffect(frame, [storedPoints.length]);

  const startT = storedPoints[0]?.t ?? 0;
  const endT = storedPoints[storedPoints.length - 1]?.t ?? 0;
  const progress = endT > startT ? (playhead - startT) / (endT - startT) : 0;
  const lastSeenSec = live ? Math.max(0, Math.round((Date.now() - live.receivedAt) / 1000)) : null;
  const mutedStops = stops.filter((s) => s.lat != null && s.lng != null);

  const setFollowBoth = (v: boolean) => { followRef.current = v; setFollow(v); };

  return (
    <View style={StyleSheet.absoluteFill}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={DEFAULT_REGION}
        onMapReady={frame}
        onPanDrag={() => setFollowBoth(false)}
        loadingEnabled
      >
        {/* muted stop context pins */}
        {mutedStops.map((s) => (
          <Marker
            key={s.taskExecutionUuid}
            coordinate={{ latitude: s.lat as number, longitude: s.lng as number }}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <View style={styles.stopDot} />
          </Marker>
        ))}

        {/* stored path (grey) */}
        {storedPoints.length > 1 && (
          <Polyline coordinates={storedPoints} strokeColor="#9ca3af" strokeWidth={3} />
        )}

        {mode === 'live' ? (
          <>
            {liveTrail.length > 1 && (
              <Polyline coordinates={liveTrail} strokeColor="#16a34a" strokeWidth={4} />
            )}
            {live && (
              <Marker coordinate={live} anchor={{ x: 0.5, y: 0.5 }} zIndex={999}>
                <View style={styles.liveHalo}>
                  <View style={styles.liveDot} />
                </View>
              </Marker>
            )}
          </>
        ) : (
          <>
            {traversed.length > 1 && (
              <Polyline coordinates={traversed} strokeColor="#5469D4" strokeWidth={4} />
            )}
            {playbackPos && (
              <Marker coordinate={playbackPos} anchor={{ x: 0.5, y: 0.5 }} zIndex={999}>
                <View style={styles.playHalo}>
                  <View style={styles.playDot} />
                </View>
              </Marker>
            )}
          </>
        )}
      </MapView>

      {/* mode switch + close */}
      <View style={styles.topBar} pointerEvents="box-none">
        <View style={styles.segment}>
          {(['live', 'playback'] as const).map((m) => (
            <TouchableOpacity
              key={m}
              style={[styles.segmentBtn, mode === m && styles.segmentBtnActive]}
              onPress={() => setMode(m)}
              testID={`tracking-mode-${m}`}
            >
              <ThemedText style={[styles.segmentText, mode === m && styles.segmentTextActive]}>
                {m === 'live' ? t('tracking.live') : t('tracking.playback')}
              </ThemedText>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose} testID="tracking-close">
          <ThemedText style={styles.closeText}>✕</ThemedText>
        </TouchableOpacity>
      </View>

      {/* recenter/follow */}
      {!follow && (
        <TouchableOpacity
          style={styles.recenterBtn}
          onPress={() => setFollowBoth(true)}
          testID="tracking-recenter"
        >
          <ThemedText style={styles.recenterText}>{t('tracking.recenter')}</ThemedText>
        </TouchableOpacity>
      )}

      {/* bottom control card */}
      <View style={styles.bottomWrap} pointerEvents="box-none">
        <View style={styles.card}>
          {mode === 'live' ? (
            <View style={styles.liveRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      status === 'connected' ? '#16a34a' : status === 'connecting' ? '#d97706' : '#dc2626',
                  },
                ]}
              />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.liveName} numberOfLines={1}>
                  {live?.username || user?.username || (userMissing ? t('tracking.noDriver') : '…')}
                </ThemedText>
                <ThemedText style={styles.liveMeta}>
                  {status !== 'connected'
                    ? status === 'connecting'
                      ? t('tracking.connecting')
                      : t('tracking.disconnected')
                    : live
                    ? `${t('tracking.lastSeen', { sec: lastSeenSec ?? 0 })}${
                        typeof live.speed === 'number' ? ` · ${(live.speed * 3.6).toFixed(0)} km/h` : ''
                      }`
                    : t('tracking.waiting')}
                </ThemedText>
              </View>
            </View>
          ) : storedPoints.length < 2 ? (
            <ThemedText style={styles.emptyText}>{t('tracking.noPoints')}</ThemedText>
          ) : (
            <View>
              <View style={styles.playRow}>
                <TouchableOpacity
                  style={styles.playBtn}
                  onPress={() => {
                    if (!playing && playhead >= endT) setPlayhead(startT); // replay from start
                    setPlaying((p) => !p);
                    setFollowBoth(true);
                  }}
                  testID="tracking-play"
                >
                  <ThemedText style={styles.playBtnText}>{playing ? '❚❚' : '▶'}</ThemedText>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.speedBtn}
                  onPress={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
                  testID="tracking-speed"
                >
                  <ThemedText style={styles.speedText}>{SPEEDS[speedIdx]}×</ThemedText>
                </TouchableOpacity>
                <ThemedText style={styles.timeText}>
                  {playbackPos ? fmtClock(playbackPos.t) : '—'}
                  <ThemedText style={styles.timeRange}> · {fmtClock(startT)}–{fmtClock(endT)}</ThemedText>
                </ThemedText>
              </View>
              <ScrubBar
                progress={Math.min(1, Math.max(0, progress))}
                onSeek={(p) => {
                  setPlaying(false);
                  setPlayhead(startT + p * (endT - startT));
                }}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: {
    position: 'absolute', top: 12, left: 12, right: 12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  segment: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 3,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },
  segmentBtn: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 9 },
  segmentBtnActive: { backgroundColor: '#5469D4' },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#4B5563' },
  segmentTextActive: { color: '#fff' },
  closeBtn: {
    position: 'absolute', right: 0, width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },
  closeText: { fontSize: 15, color: '#374151', fontWeight: '700' },
  recenterBtn: {
    position: 'absolute', right: 12, bottom: 132, backgroundColor: '#fff', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 5,
  },
  recenterText: { fontSize: 12, fontWeight: '700', color: '#5469D4' },
  bottomWrap: { position: 'absolute', left: 12, right: 12, bottom: 24 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 8,
  },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  liveName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  liveMeta: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  emptyText: { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingVertical: 6 },
  playRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  playBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#5469D4',
    alignItems: 'center', justifyContent: 'center',
  },
  playBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  speedBtn: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  speedText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  timeText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#111827', textAlign: 'right' },
  timeRange: { fontSize: 11, color: '#9CA3AF', fontWeight: '400' },
  scrubTouch: { height: 28, justifyContent: 'center' },
  scrubTrack: { height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', overflow: 'hidden' },
  scrubFill: { height: 4, backgroundColor: '#5469D4' },
  scrubThumb: {
    position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: '#5469D4',
    marginLeft: -8, borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, shadowOffset: { width: 0, height: 1 },
  },
  stopDot: {
    width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(84,105,212,0.45)',
    borderWidth: 2, borderColor: '#fff',
  },
  liveHalo: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(22,163,74,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  liveDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#16a34a', borderWidth: 2, borderColor: '#fff' },
  playHalo: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(84,105,212,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  playDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#5469D4', borderWidth: 2, borderColor: '#fff' },
});
