import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Play, Pause } from "lucide-react";

// Fix default marker icons in react-leaflet (see components/map/CustomerMap.tsx)
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import markerIconRetina from "leaflet/dist/images/marker-icon-2x.png";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIconRetina,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export interface PlaybackPoint {
  coordinates: string; // "lat,lon"
  recorded_at: string; // ISO datetime (no timezone suffix = UTC)
  speed?: number | null; // m/s
  heading?: number | null;
  accuracy?: number | null;
  trip_uuid?: string | null;
}

const PRIMARY = "#5469D4";
const SPEED_OPTIONS = [1, 4, 10, 30];
const MIN_STEP_MS = 100;
const MAX_STEP_MS = 5000;
// avoid rendering thousands of per-point circle markers on long series
const MAX_DOT_MARKERS = 1000;

// prominent icon for the current playback position
const playbackIcon = L.divIcon({
  html: `<svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg">
    <circle cx="15" cy="15" r="13" fill="${PRIMARY}" fill-opacity="0.25"/>
    <circle cx="15" cy="15" r="8" fill="${PRIMARY}" stroke="white" stroke-width="3"/>
  </svg>`,
  className: "location-playback-icon",
  iconSize: [30, 30],
  iconAnchor: [15, 15],
});

// timestamps without a timezone suffix are UTC (same convention as TripStopsMap.tsx)
function parseRecordedAt(s: string): Date {
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + "Z");
}

interface ParsedPoint extends PlaybackPoint {
  lat: number;
  lon: number;
  time: number; // epoch ms
}

function FitBoundsOnce({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && positions.length > 0) {
      map.fitBounds(L.latLngBounds(positions), { padding: [40, 40] });
      fitted.current = true;
    }
  }, [map, positions]);
  return null;
}

export function LocationPlayback({
  points,
  heightClass = "h-[420px]",
}: {
  points: PlaybackPoint[];
  heightClass?: string;
}): JSX.Element {
  const parsed = useMemo<ParsedPoint[]>(() => {
    return points
      .map((p) => {
        const [lat, lon] = (p.coordinates || "").split(",").map(Number);
        const time = parseRecordedAt(p.recorded_at || "").getTime();
        return { ...p, lat, lon, time };
      })
      .filter(
        (p) =>
          Number.isFinite(p.lat) &&
          Number.isFinite(p.lon) &&
          Math.abs(p.lat) <= 90 &&
          Math.abs(p.lon) <= 180 &&
          Number.isFinite(p.time)
      )
      .sort((a, b) => a.time - b.time);
  }, [points]);

  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedFactor, setSpeedFactor] = useState(4);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // reset playback when the underlying series changes
  useEffect(() => {
    setIndex(0);
    setPlaying(false);
  }, [parsed]);

  const safeIndex = Math.min(index, Math.max(0, parsed.length - 1));

  // advance through points in real time scaled by the speed factor
  useEffect(() => {
    if (!playing) return;
    if (safeIndex >= parsed.length - 1) {
      setPlaying(false);
      return;
    }
    const gap = parsed[safeIndex + 1].time - parsed[safeIndex].time;
    const rawDelay = gap / speedFactor;
    const delay = Number.isFinite(rawDelay)
      ? Math.min(MAX_STEP_MS, Math.max(MIN_STEP_MS, rawDelay))
      : MIN_STEP_MS;
    timerRef.current = setTimeout(() => {
      setIndex((i) => Math.min(i + 1, parsed.length - 1));
    }, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [playing, safeIndex, speedFactor, parsed]);

  if (parsed.length === 0) {
    return (
      <div
        className={`${heightClass} w-full rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center`}
        data-testid="location-playback-empty"
      >
        <p className="text-sm text-gray-500">No location points recorded.</p>
      </div>
    );
  }

  const path = parsed.map((p) => [p.lat, p.lon] as [number, number]);
  const current = parsed[safeIndex];

  const handlePlayPause = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    // pressing play at the end restarts
    if (safeIndex >= parsed.length - 1) setIndex(0);
    setPlaying(true);
  };

  const timeLabel = new Date(current.time).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "medium",
  });
  const speedKmh =
    current.speed !== null && current.speed !== undefined
      ? `${(current.speed * 3.6).toFixed(1)} km/h`
      : null;

  return (
    <div className="space-y-3" data-testid="location-playback">
      {/* map */}
      <div className={`${heightClass} w-full rounded-lg overflow-hidden border border-gray-200`}>
        <MapContainer center={path[0]} zoom={13} style={{ height: "100%", width: "100%" }}>
          <FitBoundsOnce positions={path} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Polyline positions={path} pathOptions={{ color: PRIMARY, weight: 3 }} />
          {parsed.length <= MAX_DOT_MARKERS &&
            parsed.map((p, i) => (
              <CircleMarker
                key={`${p.time}-${i}`}
                center={[p.lat, p.lon]}
                radius={2}
                pathOptions={{
                  color: PRIMARY,
                  opacity: 0.4,
                  fillColor: PRIMARY,
                  fillOpacity: 0.4,
                }}
              />
            ))}
          <Marker position={[current.lat, current.lon]} icon={playbackIcon} />
        </MapContainer>
      </div>

      {/* playback controls */}
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePlayPause}
          data-testid="button-playback-toggle"
        >
          {playing ? (
            <>
              <Pause className="h-4 w-4 mr-2" /> Pause
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" /> Play
            </>
          )}
        </Button>
        <Slider
          value={[safeIndex]}
          onValueChange={(v) => {
            setPlaying(false);
            setIndex(v[0]);
          }}
          min={0}
          max={parsed.length - 1}
          step={1}
          className="flex-1"
          data-testid="slider-playback-index"
        />
        <Select value={String(speedFactor)} onValueChange={(v) => setSpeedFactor(Number(v))}>
          <SelectTrigger className="w-[84px] h-9" data-testid="select-playback-speed">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPEED_OPTIONS.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}x
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* current point info */}
      <div
        className="flex items-center gap-3 text-sm text-gray-500"
        data-testid="playback-current-info"
      >
        <span className="whitespace-nowrap">
          {safeIndex + 1} / {parsed.length}
        </span>
        <span>{timeLabel}</span>
        {speedKmh && <span>{speedKmh}</span>}
      </div>
    </div>
  );
}
