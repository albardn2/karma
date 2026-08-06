// Shape-as-identity helpers for service areas.
//
// WHY THIS EXISTS. The list row used to be name + description + date, and on the
// real corpus that is almost no information at all: 11 of 13 areas are named some
// case variant of "Distribution <n>", 12 of 13 have no description, and 10 of 13
// were created on the same day. Three fields, all nearly constant. The one thing
// that actually differs between two service areas is the thing neither client has
// ever drawn in a row — the boundary itself.
//
// A <MapView> per row is not the way to draw it. react-native-maps mounts a real
// MKMapView/GoogleMap per instance, with its own render thread and tile fetches;
// `liteMode` (the cheap bitmap path) is Android-only, and `cacheEnabled` still has
// to render once per instance. react-native-svg is already a dependency of this app
// (Chart.tsx, BottomNavigation.tsx, TripAnalyticsCard.tsx, customers/[id].tsx), it
// costs one flat native view and one Path per row, it needs no network, and unlike a
// map it also renders in the browser build — which is the target that made
// `serviceAreas.webUnsupported` necessary in the first place.

import { PolygonRings } from '@/utils/wkt';

const DEG = Math.PI / 180;

/**
 * An SVG path for every ring in `polys`, fitted into a `size`×`size` box.
 *
 * ASPECT RATIO IS PRESERVED — one scale factor for both axes, then centred. The real
 * corpus runs from 0.88 to 2.15 wide-to-tall, and stretching each shape to fill the
 * box would erase exactly the difference that makes a thumbnail worth drawing: every
 * area would come out a box-shaped blob.
 *
 * Longitude is multiplied by cos(latitude) before scaling. Without it a Damascus-
 * latitude ring is stretched sideways by 1/cos(33.5°) ≈ 1.2, so the thumbnail would
 * not match the shape the same area draws on the detail map.
 *
 * SCALE IS DELIBERATELY DISCARDED. Each shape is normalised to its own box, so a
 * 4 km² area and a 405 km² area can produce identical paths — the real corpus spans
 * exactly that 93× range. The thumbnail answers "which shape is this", the km²
 * label next to it answers "how big is it". Neither is redundant.
 *
 * Returns null when there is nothing drawable, so the caller can render a
 * placeholder rather than an empty box that reads as "covers nowhere".
 */
export function thumbPath(polys: PolygonRings[], size: number, pad: number): string | null {
  const rings = polys.flatMap((p) => [p.coordinates, ...p.holes]).filter((r) => r.length >= 3);
  if (!rings.length) return null;

  const pts = rings.flat();
  const lat0 = pts.reduce((s, p) => s + p.latitude, 0) / pts.length;
  const kx = Math.cos(lat0 * DEG);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    const x = p.longitude * kx;
    const y = -p.latitude; // SVG y grows downward
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  const box = size - pad * 2;
  const scale = box / Math.max(maxX - minX, maxY - minY, 1e-9);
  const ox = pad + (box - (maxX - minX) * scale) / 2;
  const oy = pad + (box - (maxY - minY) * scale) / 2;
  const f = (n: number) => Math.round(n * 10) / 10; // 0.1pt — finer is bytes for nothing

  let d = '';
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i];
      d += `${i === 0 ? 'M' : 'L'}${f(ox + (p.longitude * kx - minX) * scale)} ${f(
        oy + (-p.latitude - minY) * scale,
      )}`;
    }
    d += 'Z';
  }
  return d;
}
