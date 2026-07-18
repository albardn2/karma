import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { AppLayout } from "@/components/layout/AppLayout";
import { apiRequest } from "@/lib/queryClient";
import { MqttClient, type MqttMessage } from "@/lib/mqttClient";
import { useLanguage } from "@/contexts/LanguageContext";

// Fix default marker icons in react-leaflet
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import markerIconRetina from "leaflet/dist/images/marker-icon-2x.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIconRetina,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const DEFAULT_CENTER: [number, number] = [33.5138, 36.2765]; // Damascus
const DEFAULT_ZOOM = 12;
const INITIAL_RECONNECT_MS = 5000;
const MAX_RECONNECT_MS = 60000;

interface DriverPosition {
  userUuid: string;
  lat: number;
  lon: number;
  username: string;
  recordedAt: number | null; // epoch ms, from the payload's recorded_at
  receivedAt: number; // epoch ms, when the message arrived here
  speed?: number; // m/s, as reported by the device
}

type ConnectionStatus = "connecting" | "connected" | "disconnected";

// Timestamps may arrive without a timezone suffix; treat those as UTC
function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const iso = /[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : value + "Z";
  const t = Date.parse(iso);
  return isNaN(t) ? null : t;
}

// Defensively parse an MQTT payload into a driver position (null if malformed)
function parsePosition(payload: string): Omit<DriverPosition, "receivedAt"> | null {
  try {
    const data = JSON.parse(payload);
    if (!data || typeof data !== "object") return null;
    if (typeof data.user_uuid !== "string" || !data.user_uuid) return null;
    if (typeof data.coordinates !== "string") return null;

    const parts = data.coordinates.split(",");
    if (parts.length !== 2) return null;
    const lat = Number(parts[0]);
    const lon = Number(parts[1]);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

    return {
      userUuid: data.user_uuid,
      lat,
      lon,
      username:
        typeof data.username === "string" && data.username
          ? data.username
          : data.user_uuid.substring(0, 8),
      recordedAt: parseTimestamp(data.recorded_at),
      speed:
        typeof data.speed === "number" && isFinite(data.speed) && data.speed >= 0
          ? data.speed
          : undefined,
    };
  } catch {
    return null;
  }
}

function lastSeenLabel(
  ts: number,
  now: number,
  t: (key: string, vars?: Record<string, string | number>) => string
): string {
  const seconds = Math.max(0, Math.floor((now - ts) / 1000));
  if (seconds < 60) return t("location.lastSeenSecondsAgo", { n: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("location.lastSeenMinutesAgo", { n: minutes });
  const hours = Math.floor(minutes / 60);
  return t("location.lastSeenHoursAgo", { n: hours });
}

// Fit the map to the markers once, when the first positions arrive;
// after that, leave the user's panning/zooming alone.
function FitBoundsOnce({ points }: { points: [number, number][] }) {
  const map = useMap();
  const fittedRef = useRef(false);
  useEffect(() => {
    if (!fittedRef.current && points.length > 0) {
      fittedRef.current = true;
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 15 });
    }
  }, [map, points]);
  return null;
}

const STATUS_BADGE: Record<ConnectionStatus, { labelKey: string; className: string }> = {
  connecting: {
    labelKey: "location.connecting",
    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300",
  },
  connected: {
    labelKey: "location.connected",
    className: "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300",
  },
  disconnected: {
    labelKey: "location.disconnected",
    className: "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300",
  },
};

export default function LiveMap() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Map<string, DriverPosition>>(new Map());
  const [now, setNow] = useState(() => Date.now());

  // Recompute "last seen" labels every 5 seconds
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  // MQTT lifecycle: fetch broker config, connect, subscribe, reconnect with
  // exponential backoff while mounted, and tear everything down on unmount.
  useEffect(() => {
    let disposed = false;
    let client: MqttClient | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoffMs = INITIAL_RECONNECT_MS;

    const handleMessage = (msg: MqttMessage) => {
      const position = parsePosition(msg.payload);
      if (!position) return;
      setDrivers((prev) => {
        const next = new Map(prev);
        next.set(position.userUuid, { ...position, receivedAt: Date.now() });
        return next;
      });
    };

    const scheduleReconnect = (brokerUrl: string, topicPrefix: string) => {
      if (disposed || reconnectTimer) return;
      const delay = backoffMs;
      backoffMs = Math.min(backoffMs * 2, MAX_RECONNECT_MS);
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect(brokerUrl, topicPrefix);
      }, delay);
    };

    const connect = async (brokerUrl: string, topicPrefix: string) => {
      if (disposed) return;
      const mqtt = new MqttClient({
        url: brokerUrl,
        clientId: `karma-web-${Math.random().toString(36).slice(2, 10)}`,
        onMessage: handleMessage,
        onStatus: (s) => {
          if (disposed) return;
          if (s === "connected") {
            backoffMs = INITIAL_RECONNECT_MS;
            setStatus("connected");
            setError(null);
          } else if (s === "connecting") {
            setStatus("connecting");
          } else {
            // closed / error
            setStatus("disconnected");
            scheduleReconnect(brokerUrl, topicPrefix);
          }
        },
      });
      client = mqtt;
      try {
        await mqtt.connect();
        if (disposed) {
          mqtt.close();
          return;
        }
        mqtt.subscribe(`${topicPrefix}/+`);
      } catch {
        // onStatus('error') already fired and scheduled a reconnect
      }
    };

    (async () => {
      try {
        const config = await apiRequest("/location/client-config");
        if (disposed) return;
        const brokerUrl = config?.broker_ws_url;
        const topicPrefix = config?.topic_prefix;
        if (typeof brokerUrl !== "string" || !brokerUrl || typeof topicPrefix !== "string" || !topicPrefix) {
          setStatus("disconnected");
          setError(t("location.notConfigured"));
          return;
        }
        await connect(brokerUrl, topicPrefix);
      } catch (err) {
        if (disposed) return;
        setStatus("disconnected");
        setError(err instanceof Error ? err.message : t("location.failedLoadConfig"));
      }
    })();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      client?.close();
    };
  }, []);

  const positions = useMemo(() => Array.from(drivers.values()), [drivers]);
  const points = useMemo(
    () => positions.map((d) => [d.lat, d.lon] as [number, number]),
    [positions]
  );

  const badge = STATUS_BADGE[status];

  return (
    <AppLayout>
      <div className="flex-1 flex flex-col min-h-0 p-6 gap-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t("nav.liveMap")}</h1>
            <p className="text-muted-foreground">{t("location.liveSubtitle")}</p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${badge.className}`}
              data-testid="badge-connection-status"
            >
              {t(badge.labelKey)}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400" data-testid="text-driver-count">
              {positions.length === 1
                ? t("location.driverVisible", { count: positions.length })
                : t("location.driversVisible", { count: positions.length })}
            </span>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-400" data-testid="text-live-map-error">
            {error}
          </p>
        )}

        {/* Map */}
        <div className="flex-1 min-h-[400px] rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden" dir="ltr">
          <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{ height: "100%", width: "100%" }}>
            <FitBoundsOnce points={points} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {positions.map((driver) => (
              <Marker key={driver.userUuid} position={[driver.lat, driver.lon]}>
                <Popup>
                  <div className="text-sm space-y-1">
                    <div className="font-semibold">{driver.username}</div>
                    <div className="text-gray-600">
                      {driver.lat.toFixed(5)}, {driver.lon.toFixed(5)}
                    </div>
                    <div className="text-gray-500">
                      {lastSeenLabel(driver.recordedAt ?? driver.receivedAt, now, t)}
                    </div>
                    {driver.speed !== undefined && (
                      <div className="text-gray-500">
                        {t("location.kmh", { speed: (driver.speed * 3.6).toFixed(1) })}
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </AppLayout>
  );
}
