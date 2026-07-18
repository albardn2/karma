import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Polyline, Popup } from "react-leaflet";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { MqttClient } from "@/lib/mqttClient";
import { LocationPlayback, type PlaybackPoint } from "@/components/location/LocationPlayback";
import { useLanguage } from "@/contexts/LanguageContext";
import "leaflet/dist/leaflet.css";

// leaflet default icon fix (repo convention)
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface LivePosition {
  lat: number;
  lon: number;
  username?: string;
  recordedAt?: string;
  speed?: number | null;
  receivedAt: number;
}

interface ClientConfig {
  broker_ws_url: string;
  topic_prefix: string;
}

interface TaskExecution {
  operator?: string | null;
  result?: Record<string, unknown> | null;
}

const parseLatLon = (s: unknown): [number, number] | null => {
  if (typeof s !== "string") return null;
  const [lat, lon] = s.split(",").map((x) => parseFloat(x.trim()));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lat, lon];
};

/**
 * Trip location section with two modes:
 * - Live: subscribes to the assigned driver's MQTT topic and follows their
 *   position in real time (in-progress trips only)
 * - Playback: scrub through the stored trip series
 */
export function TripLocationMap({
  tripStatus,
  workflowExecutionUuid,
  points,
}: {
  tripStatus: string;
  workflowExecutionUuid?: string | null;
  points: PlaybackPoint[];
}) {
  const { t } = useLanguage();
  const liveAvailable = tripStatus === "in_progress";
  const [mode, setMode] = useState<"live" | "playback">(liveAvailable ? "live" : "playback");

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {liveAvailable && (
          <Button
            size="sm"
            variant={mode === "live" ? "default" : "outline"}
            onClick={() => setMode("live")}
            data-testid="trip-location-mode-live"
          >
            {t("location.live")}
          </Button>
        )}
        <Button
          size="sm"
          variant={mode === "playback" ? "default" : "outline"}
          onClick={() => setMode("playback")}
          data-testid="trip-location-mode-playback"
        >
          {t("location.playback")}
        </Button>
      </div>

      {mode === "live" && liveAvailable ? (
        <LiveTripMap workflowExecutionUuid={workflowExecutionUuid} points={points} />
      ) : points.length > 0 ? (
        <LocationPlayback points={points} />
      ) : (
        <p className="text-sm text-gray-500" data-testid="trip-location-empty">
          {t("location.noTripPoints")}
        </p>
      )}
    </div>
  );
}

function LiveTripMap({
  workflowExecutionUuid,
  points,
}: {
  workflowExecutionUuid?: string | null;
  points: PlaybackPoint[];
}) {
  const { t } = useLanguage();
  const { data: execution } = useQuery<{ task_executions?: TaskExecution[] }>({
    queryKey: ["/workflow-execution", workflowExecutionUuid],
    queryFn: () => apiRequest(`/workflow-execution/${workflowExecutionUuid}`),
    enabled: !!workflowExecutionUuid,
    retry: false,
  });
  const { data: usersData } = useQuery<{ users: { uuid: string; username: string }[] }>({
    queryKey: ["/auth/users", "all"],
    queryFn: () => apiRequest("/auth/users?per_page=100"),
    retry: false,
  });

  const driver = useMemo(() => {
    if (!execution?.task_executions || !usersData?.users) return null;
    const setup = execution.task_executions.find((t) => t.operator === "start_trip_operator");
    const assigned = setup?.result?.["assigned_user_uuid"];
    if (typeof assigned !== "string" || !assigned) return null;
    return usersData.users.find((u) => u.username === assigned || u.uuid === assigned) ?? null;
  }, [execution, usersData]);

  if (execution && usersData && !driver) {
    return (
      <p className="text-sm text-gray-500" data-testid="trip-live-no-driver">
        {t("location.liveUnavailableNoDriver")}
      </p>
    );
  }
  if (!driver) {
    return <p className="text-sm text-gray-500">{t("location.resolvingDriver")}</p>;
  }
  return <LiveLocationMap userUuid={driver.uuid} username={driver.username} points={points} />;
}

export function LiveLocationMap({
  userUuid,
  username,
  points,
}: {
  userUuid: string;
  username?: string;
  points: PlaybackPoint[];
}) {
  const { t } = useLanguage();
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [live, setLive] = useState<LivePosition | null>(null);
  const [liveTrail, setLiveTrail] = useState<[number, number][]>([]);
  const [tick, setTick] = useState(0); // refresh "last seen" labels
  const clientRef = useRef<MqttClient | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayRef = useRef(5000);
  const mapRef = useRef<L.Map | null>(null);
  const centeredRef = useRef(false);

  const { data: clientConfig } = useQuery<ClientConfig>({
    queryKey: ["/location/client-config"],
    queryFn: () => apiRequest("/location/client-config"),
    retry: false,
  });

  // live "last seen" ages
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!clientConfig) return;
    let disposed = false;

    const connect = async () => {
      setStatus("connecting");
      const client = new MqttClient({
        url: clientConfig.broker_ws_url,
        clientId: `karma-trip-live-${Math.random().toString(36).slice(2, 10)}`,
        onMessage: (msg) => {
          try {
            const data = JSON.parse(msg.payload);
            const coords = parseLatLon(data.coordinates);
            if (!coords) return;
            setLive({
              lat: coords[0],
              lon: coords[1],
              username: typeof data.username === "string" ? data.username : undefined,
              recordedAt: typeof data.recorded_at === "string" ? data.recorded_at : undefined,
              speed: typeof data.speed === "number" ? data.speed : null,
              receivedAt: Date.now(),
            });
            setLiveTrail((trail) => {
              const last = trail[trail.length - 1];
              if (last && last[0] === coords[0] && last[1] === coords[1]) return trail;
              return [...trail.slice(-500), coords];
            });
          } catch {
            // malformed payload — ignore
          }
        },
        onStatus: (s) => {
          if (disposed) return;
          if (s === "connected") {
            setStatus("connected");
            delayRef.current = 5000;
            client.subscribe(`${clientConfig.topic_prefix}/${userUuid}`);
          } else if (s === "closed" || s === "error") {
            setStatus("disconnected");
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
      clientRef.current = client;
      await client.connect();
    };

    connect().catch(() => setStatus("disconnected"));
    return () => {
      disposed = true;
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      clientRef.current?.close();
      clientRef.current = null;
    };
  }, [userUuid, clientConfig?.broker_ws_url, clientConfig?.topic_prefix]);

  // center on the driver the first time a live position arrives
  useEffect(() => {
    if (live && mapRef.current && !centeredRef.current) {
      centeredRef.current = true;
      mapRef.current.setView([live.lat, live.lon], 14);
    }
  }, [live]);

  const storedPath = useMemo(
    () => points.map((p) => parseLatLon(p.coordinates)).filter((c): c is [number, number] => !!c),
    [points]
  );

  const lastSeenSec = live ? Math.max(0, Math.round((Date.now() - live.receivedAt) / 1000)) : null;
  void tick;

  const center: [number, number] =
    live ? [live.lat, live.lon] : storedPath[storedPath.length - 1] ?? [33.5138, 36.2765];

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-sm">
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            status === "connected"
              ? "bg-green-100 text-green-800"
              : status === "connecting"
              ? "bg-yellow-100 text-yellow-800"
              : "bg-red-100 text-red-800"
          }`}
          data-testid="trip-live-status"
        >
          {status === "connected"
            ? t("location.live")
            : status === "disconnected"
            ? t("location.disconnected")
            : t("location.connectingEllipsis")}
        </span>
        {live ? (
          <span className="text-gray-600">
            {live.username ?? username ?? t("location.driver")} ·{" "}
            {t("location.lastSeenSeconds", { sec: lastSeenSec ?? 0 })}
            {typeof live.speed === "number"
              ? ` · ${t("location.kmh", { speed: (live.speed * 3.6).toFixed(1) })}`
              : ""}
          </span>
        ) : (
          <span className="text-gray-500">{t("location.waitingDriver")}</span>
        )}
      </div>
      <div className="h-[420px] rounded-md overflow-hidden border" dir="ltr">
        <MapContainer
          center={center}
          zoom={13}
          style={{ height: "100%", width: "100%" }}
          ref={mapRef as never}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {storedPath.length > 1 && (
            <Polyline positions={storedPath} pathOptions={{ color: "#9ca3af", weight: 3 }} />
          )}
          {liveTrail.length > 1 && (
            <Polyline positions={liveTrail} pathOptions={{ color: "#16a34a", weight: 3 }} />
          )}
          {live && (
            <Marker position={[live.lat, live.lon]}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{live.username ?? username ?? t("location.driver")}</div>
                  <div>
                    {live.lat.toFixed(5)}, {live.lon.toFixed(5)}
                  </div>
                  <div>{t("location.lastSeenSeconds", { sec: lastSeenSec ?? 0 })}</div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>
      <p className="mt-2 text-xs text-gray-500">
        {t("location.trailLegend")}
      </p>
    </div>
  );
}
