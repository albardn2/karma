// Minimal WKT parser for service-area geometries.
// Backend stores service areas as WKT POLYGON (MULTIPOLYGON tolerated), with
// coordinates in standard WKT "x y" = "lon lat" order.

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface PolygonRings {
  /** outer ring */
  coordinates: LatLng[];
  /** inner rings (holes), if any */
  holes: LatLng[][];
}

const parseRing = (txt: string): LatLng[] =>
  txt
    .split(',')
    .map((pair) => {
      const [x, y] = pair.trim().split(/\s+/).map(Number);
      return { latitude: y, longitude: x };
    })
    .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));

/**
 * Parse a WKT POLYGON or MULTIPOLYGON into polygon ring sets usable by
 * react-native-maps' <Polygon>. Returns [] for anything else.
 */
export function parseWktPolygons(wkt: string): PolygonRings[] {
  if (!wkt) return [];
  const upper = wkt.trim().toUpperCase();
  const isMulti = upper.startsWith('MULTIPOLYGON');
  const isPoly = !isMulti && upper.startsWith('POLYGON');
  if (!isMulti && !isPoly) return [];

  // Walk the string tracking paren depth: a polygon group opens at `polyDepth`
  // and each of its rings one level deeper. POLYGON ((r1),(r2)) → polyDepth 1;
  // MULTIPOLYGON (((r1)),((r2))) → polyDepth 2.
  const polyDepth = isMulti ? 2 : 1;
  const polys: LatLng[][][] = [];
  let current: LatLng[][] | null = null;
  let ringStart = -1;
  let depth = 0;
  for (let i = 0; i < wkt.length; i++) {
    const c = wkt[i];
    if (c === '(') {
      depth++;
      if (depth === polyDepth) current = [];
      else if (depth === polyDepth + 1) ringStart = i + 1;
    } else if (c === ')') {
      if (depth === polyDepth + 1 && ringStart >= 0 && current) {
        current.push(parseRing(wkt.slice(ringStart, i)));
        ringStart = -1;
      } else if (depth === polyDepth && current) {
        polys.push(current);
        current = null;
      }
      depth--;
    }
  }

  return polys
    .map((rings) => ({
      coordinates: rings[0] || [],
      holes: rings.slice(1).filter((r) => r.length >= 3),
    }))
    .filter((p) => p.coordinates.length >= 3);
}

// ---------------------------------------------------------------------------
// WKT WRITER
//
// There is exactly ONE place in this app that turns coordinates into a geometry
// string, and this is it. That is not tidiness. The backend accepts a latitude-
// first ring with a 201 and stores it in the wrong hemisphere, and accepts
// longitude 500 / latitude 300 the same way — nothing downstream will ever catch
// a transposition. So the only defence available is that there is a single
// function to get right, and a test that pins it.
// ---------------------------------------------------------------------------

/** Mean Earth radius in metres (IUGG). */
const EARTH_R = 6371008.8;
const DEG = Math.PI / 180;

/** 6 dp ≈ 11 cm. Finer is noise; coarser collapses a small ring's vertices. */
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/**
 * The point `metres` away from (lat, lon) on bearing `bearingDeg`, on a sphere.
 *
 * Spherical rather than the flat `dLat = m / 111320` shortcut, because the flat
 * form skews visibly into an ellipse at Damascus latitudes once the radius passes
 * a few kilometres — and the user is comparing this ring against a <Circle> drawn
 * by the native map SDK, so any skew reads as a bug in the app.
 */
export function destination(
  lat: number,
  lon: number,
  bearingDeg: number,
  metres: number,
): LatLng {
  const d = metres / EARTH_R;
  const br = bearingDeg * DEG;
  const la = lat * DEG;
  const lo = lon * DEG;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
  const lo2 =
    lo +
    Math.atan2(
      Math.sin(br) * Math.sin(d) * Math.cos(la),
      Math.cos(d) - Math.sin(la) * Math.sin(la2),
    );
  return { latitude: la2 / DEG, longitude: ((lo2 / DEG + 540) % 360) - 180 };
}

/**
 * An OPEN ring of `segments` points approximating a circle, clockwise from north.
 *
 * Open, not closed: closure belongs to ringToWkt, which is the only function that
 * knows the wire format.
 *
 * That this ring is GENERATED is why this module needs no self-intersection test.
 * A convex polygon cannot self-intersect, so the server's refusal for a bad shape
 * — a 400 whose message reads like a library stack trace and contains U+2010
 * hyphens rather than ASCII ones — is unreachable by construction. The way never
 * to show a user that string is to make the shape incapable of being invalid,
 * not to re-implement the validator client-side.
 */
export function circleRing(
  lat: number,
  lon: number,
  radiusM: number,
  segments = 48,
): LatLng[] {
  const pts: LatLng[] = [];
  for (let i = 0; i < segments; i++) {
    const p = destination(lat, lon, (360 * i) / segments, radiusM);
    pts.push({ latitude: round6(p.latitude), longitude: round6(p.longitude) });
  }
  return pts;
}

/**
 * Serialise a ring to the exact WKT this backend accepts:
 *   POLYGON((lon lat,lon lat,...,lon0 lat0))
 *
 * Every detail is load-bearing, and every one was checked against the live API:
 *  - LONGITUDE FIRST. WKT is (x y). A transposed ring is a 201 and silently wrong.
 *  - NO "SRID=4326;" prefix. EWKT is a 400 (ParseException: Unknown type).
 *  - The ring is closed by re-appending vertex 0's own rendered string, so the
 *    closure is byte-identical rather than merely numerically equal.
 *  - Adjacent duplicates are dropped: a zero-length edge is accepted with a 201
 *    and stored verbatim, producing two vertices no interface can separate again.
 *  - Trailing copies of vertex 0 are POPPED before re-closing. Without that, a
 *    parse → re-serialise cycle ACCRETES one vertex per save, because
 *    parseWktPolygons returns the closing point as a real point. With it the
 *    round trip is idempotent.
 *
 * Throws for a ring too small to close into a polygon. Three pairs is a 400 from
 * the server, so failing here is strictly friendlier than asking.
 */
export function ringToWkt(points: LatLng[]): string {
  const pair = (p: LatLng) => `${round6(p.longitude)} ${round6(p.latitude)}`;
  const out: string[] = [];
  for (const p of points) {
    const s = pair(p);
    if (out.length && out[out.length - 1] === s) continue;
    out.push(s);
  }
  while (out.length > 1 && out[out.length - 1] === out[0]) out.pop();
  if (out.length < 3) throw new Error('ring needs at least 3 distinct points');
  out.push(out[0]);
  return `POLYGON((${out.join(',')}))`;
}

/**
 * Reject a ring the server would happily store wrong.
 *
 * The server checks none of this: out-of-range degrees are a 201, and so is a
 * transposed ring. The antimeridian clause is not hypothetical vanity —
 * destination() wraps longitude into [-180, 180), so a circle straddling ±180
 * comes back as a ring that jumps the width of the world, and Postgres would
 * take it.
 */
export function ringIsSane(points: LatLng[]): boolean {
  if (points.length < 3) return false;
  for (const p of points) {
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) return false;
    if (p.latitude < -85 || p.latitude > 85) return false;
    if (p.longitude < -180 || p.longitude > 180) return false;
  }
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (Math.abs(a.longitude - b.longitude) > 180) return false;
  }
  return true;
}

/**
 * Approximate area in m² — equirectangular shoelace about the ring's own mean
 * latitude. Accurate to a fraction of a percent at city scale, which is all an
 * "≈12.5 km²" readout needs, and it avoids a geodesic-area dependency the app
 * does not have.
 */
export function ringAreaM2(points: LatLng[]): number {
  if (points.length < 3) return 0;
  const lat0 = points.reduce((s, p) => s + p.latitude, 0) / points.length;
  const mx = 111320 * Math.cos(lat0 * DEG);
  const my = 110574;
  let a = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    a += p.longitude * mx * (q.latitude * my) - q.longitude * mx * (p.latitude * my);
  }
  return Math.abs(a / 2);
}

/** Distinct vertices in a stored ring — the closing duplicate is not a point. */
export function ringVertexCount(points: LatLng[]): number {
  if (points.length < 2) return points.length;
  const first = points[0];
  const last = points[points.length - 1];
  const closed = first.latitude === last.latitude && first.longitude === last.longitude;
  return closed ? points.length - 1 : points.length;
}
