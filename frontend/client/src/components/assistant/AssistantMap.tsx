// Renders a map spec from the assistant's `show_map` tool (backend/assistant/maps.py):
// pins coloured by group and sized by value, a density "heat" grid, and GPS routes.
// Uses Leaflet + OpenStreetMap tiles, like the app's other maps; no plugins needed
// because the heat grid is computed by the service.
import { useEffect } from "react";
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { MapSpec } from "@/lib/assistant";

const GROUP_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#475569", "#ea580c"];
// Routes are dark and dashed so they never read as one of the pin-group colours.
const ROUTE_COLORS = ["#111827", "#475569", "#78350f", "#1e3a8a", "#14532d", "#581c87"];
const num = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

// yellow -> orange -> red, by intensity 0..1
function heatColor(t: number): string {
  const hue = 55 - 55 * Math.min(1, Math.max(0, t));
  return `hsl(${hue}, 95%, 50%)`;
}

function FitBounds({ bounds }: { bounds: MapSpec["bounds"] }) {
  const map = useMap();
  useEffect(() => {
    const [[s, w], [n, e]] = bounds;
    if (s === n && w === e) map.setView([s, w], 15);
    else map.fitBounds([[s, w], [n, e]], { padding: [20, 20], maxZoom: 16 });
  }, [map, bounds]);
  return null;
}

export function AssistantMap({ spec, tall }: { spec: MapSpec; tall?: boolean }) {
  const groupColor = (g?: string) => (g ? GROUP_COLORS[Math.max(0, spec.groups.indexOf(g)) % GROUP_COLORS.length] : GROUP_COLORS[0]);
  const values = spec.pins.map((p) => p.value).filter((v): v is number => typeof v === "number" && v > 0);
  const maxValue = values.length ? Math.max(...values) : 0;
  const radius = (v?: number | null) => (maxValue && typeof v === "number" && v > 0 ? 4 + 10 * Math.sqrt(v / maxValue) : 5);
  const maxWeight = spec.heat.length ? Math.max(...spec.heat.map((c) => c.weight)) : 0;
  const unit = spec.unit ? ` ${spec.unit}` : "";
  const src = spec.source;

  return (
    <figure data-testid="assistant-map" className="my-2 rounded-lg border bg-card p-2">
      <figcaption className="px-1 pb-1 text-xs font-semibold" dir="auto">
        {spec.title}
      </figcaption>
      <div style={{ height: tall ? 460 : 300 }} className="overflow-hidden rounded-md" dir="ltr">
        <MapContainer
          key={tall ? "tall" : "small"}
          center={[spec.bounds[0][0], spec.bounds[0][1]]}
          zoom={12}
          preferCanvas
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds bounds={spec.bounds} />

          {/* Heat: each grid cell is drawn as a soft glow sized in SCREEN pixels, so
              it stays visible at any zoom (a ~1 km rectangle vanishes when the map
              is zoomed out to a whole region). Outer halo + brighter core. */}
          {spec.heat.flatMap((c, i) => {
            const t = maxWeight ? c.weight / maxWeight : 0;
            const r = 12 + 26 * Math.sqrt(t);
            const tip = (
              <Tooltip>
                {spec.value_field ? `${num.format(c.weight)}${unit} · ` : ""}
                {c.count} record{c.count === 1 ? "" : "s"}
              </Tooltip>
            );
            return [
              <CircleMarker key={`hh${i}`} center={[c.lat, c.lon]} radius={r} pathOptions={{ stroke: false, fillColor: heatColor(t), fillOpacity: 0.18 + 0.12 * t }}>
                {tip}
              </CircleMarker>,
              <CircleMarker key={`hc${i}`} center={[c.lat, c.lon]} radius={r * 0.5} pathOptions={{ stroke: false, fillColor: heatColor(t), fillOpacity: 0.3 + 0.3 * t }}>
                {tip}
              </CircleMarker>,
            ];
          })}

          {spec.routes.map((r, i) => (
            <Polyline key={`r${i}`} positions={r.coords} pathOptions={{ color: ROUTE_COLORS[i % ROUTE_COLORS.length], weight: 3, opacity: 0.75, dashArray: "7 5" }}>
              <Tooltip sticky>{r.name}</Tooltip>
            </Polyline>
          ))}
          {spec.routes.flatMap((r, i) =>
            r.coords.length
              ? [
                  // start/end: dark rings with a permanent label, distinct from every pin colour
                  <CircleMarker key={`rs${i}`} center={r.coords[0]} radius={7} pathOptions={{ color: ROUTE_COLORS[i % ROUTE_COLORS.length], weight: 3, fillColor: "#fff", fillOpacity: 1 }}>
                    <Tooltip permanent direction="top" offset={[0, -6]}>Start{r.start ? ` ${r.start.slice(11, 16)}` : ""}</Tooltip>
                  </CircleMarker>,
                  <CircleMarker key={`re${i}`} center={r.coords[r.coords.length - 1]} radius={7} pathOptions={{ color: ROUTE_COLORS[i % ROUTE_COLORS.length], weight: 3, fillColor: ROUTE_COLORS[i % ROUTE_COLORS.length], fillOpacity: 1 }}>
                    <Tooltip permanent direction="top" offset={[0, -6]}>End{r.end ? ` ${r.end.slice(11, 16)}` : ""}</Tooltip>
                  </CircleMarker>,
                ]
              : [],
          )}

          {spec.pins.map((p, i) => (
            <CircleMarker
              key={`p${i}`}
              center={[p.lat, p.lon]}
              radius={radius(p.value)}
              pathOptions={{ color: "#ffffff", weight: 1, fillColor: groupColor(p.group), fillOpacity: 0.85 }}
            >
              <Tooltip>
                <span dir="auto">
                  {p.label || "(no name)"}
                  {typeof p.value === "number" ? ` · ${num.format(p.value)}${unit}` : ""}
                  {p.group ? ` · ${p.group}` : ""}
                </span>
              </Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className="px-1 pt-1.5 space-y-1 text-[10px] text-muted-foreground">
        {spec.groups.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {spec.groups.map((g) => (
              <span key={g} className="inline-flex items-center gap-1" dir="auto">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: groupColor(g) }} />
                {g}
              </span>
            ))}
          </div>
        )}
        {spec.heat.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span>{spec.value_field ? "less" : "fewer"}</span>
            <span className="h-2 w-20 rounded" style={{ background: `linear-gradient(to right, ${heatColor(0)}, ${heatColor(0.5)}, ${heatColor(1)})` }} />
            <span>{spec.value_field ? `more${unit}` : "more records"}</span>
          </div>
        )}
        {spec.note && <div dir="auto">{spec.note}</div>}
        <div>
          {src.kind === "query"
            ? `From Karma: ${src.endpoint?.replace("__", " · ").replace(/_/g, " ")} — ${spec.pins.length || spec.heat.reduce((a, c) => a + c.count, 0)} on the map`
            : "GPS history from Karma"}
          {src.without_coordinates ? ` · ${src.without_coordinates} without a location (not shown)` : ""}
          {spec.truncated ? " · first 3,000 pins shown" : ""}
          {" · scroll the chat, drag/zoom the map with +/−"}
        </div>
      </div>
    </figure>
  );
}
