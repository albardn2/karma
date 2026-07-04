import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Play, Pause, RotateCcw } from "lucide-react";

export interface TripStopPoint {
  uuid: string;
  index?: number | null;
  customer_name?: string | null;
  status?: string | null;
  outcome?: string | null;
  coordinates?: string | null; // "lat,lon"
  completed_at?: string | null;
}

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 0) {
      map.fitBounds(L.latLngBounds(points), { padding: [50, 50] });
    }
  }, [map, points.length]);
  return null;
}

function numberedIcon(number: number, done: boolean) {
  const color = done ? "#16a34a" : "#5469D4";
  return L.divIcon({
    html: `<div style="position: relative; width: 30px; height: 41px;">
      <svg width="30" height="41" viewBox="0 0 30 41" xmlns="http://www.w3.org/2000/svg">
        <path d="M15 0C7.268 0 1 6.268 1 14c0 14 14 26 14 26s14-12 14-26C29 6.268 22.732 0 15 0z" fill="${color}" stroke="white" stroke-width="2"/>
      </svg>
      <div style="position: absolute; top: 8px; left: 50%; transform: translateX(-50%); color: white; font-weight: bold; font-size: 12px; text-align: center; width: 100%;">
        ${number}
      </div>
    </div>`,
    className: "trip-stop-numbered-icon",
    iconSize: [30, 41],
    iconAnchor: [15, 41],
    popupAnchor: [0, -41],
  });
}

export function TripStopsMap({ stops }: { stops: TripStopPoint[] }) {
  // visibleCount: how many stops are shown; drives the "progress over time" animation
  const [visibleCount, setVisibleCount] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const points = stops
    .map((s) => {
      const [lat, lon] = (s.coordinates || "").split(",").map(Number);
      return { ...s, lat, lon };
    })
    .filter((s) => !isNaN(s.lat) && !isNaN(s.lon));

  // start fully revealed
  useEffect(() => {
    setVisibleCount(points.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.length]);

  useEffect(() => {
    if (playing) {
      timerRef.current = setInterval(() => {
        setVisibleCount((c) => {
          if (c >= points.length) {
            setPlaying(false);
            return c;
          }
          return c + 1;
        });
      }, 900);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, points.length]);

  if (points.length === 0) {
    return (
      <div className="h-96 bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-gray-500">No stop locations for this trip.</p>
      </div>
    );
  }

  const shown = points.slice(0, visibleCount);
  const path = shown.map((p) => [p.lat, p.lon] as [number, number]);
  const allPoints = points.map((p) => [p.lat, p.lon] as [number, number]);

  const play = () => {
    if (visibleCount >= points.length) setVisibleCount(0);
    setPlaying(true);
  };

  const fmtTime = (s?: string | null) => {
    if (!s) return null;
    const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? s : s + "Z");
    return isNaN(d.getTime()) ? s : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="space-y-3">
      {/* animation controls */}
      <div className="flex items-center gap-4">
        {playing ? (
          <Button variant="outline" size="sm" onClick={() => setPlaying(false)} data-testid="button-stops-pause">
            <Pause className="h-4 w-4 mr-2" /> Pause
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={play} data-testid="button-stops-play">
            <Play className="h-4 w-4 mr-2" /> Play
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => { setPlaying(false); setVisibleCount(points.length); }} data-testid="button-stops-reset">
          <RotateCcw className="h-4 w-4 mr-2" /> Show all
        </Button>
        <span className="text-sm text-gray-500 whitespace-nowrap" data-testid="stops-map-progress">
          {Math.min(visibleCount, points.length)} / {points.length} stops
        </span>
        <Slider
          value={[visibleCount]}
          onValueChange={(v) => { setPlaying(false); setVisibleCount(v[0]); }}
          min={0}
          max={points.length}
          step={1}
          className="flex-1"
          data-testid="slider-stops-progress"
        />
      </div>

      {/* map */}
      <div className="h-96 w-full rounded-lg overflow-hidden border border-gray-200">
        <MapContainer center={allPoints[0]} zoom={13} style={{ height: "100%", width: "100%" }}>
          <FitBounds points={allPoints} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Polyline positions={path} pathOptions={{ color: "#5469D4", weight: 3, dashArray: "6 8" }} />
          {shown.map((p, i) => (
            <Marker key={p.uuid} position={[p.lat, p.lon]} icon={numberedIcon(i + 1, p.status === "completed")}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{i + 1}. {p.customer_name || "Unknown customer"}</div>
                  {p.outcome && <div className="text-gray-600">{p.outcome}</div>}
                  {p.completed_at && <div className="text-gray-500">Completed {fmtTime(p.completed_at)}</div>}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
