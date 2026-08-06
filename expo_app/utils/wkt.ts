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

// ---------------------------------------------------------------------------
// PREDICATES FOR HAND-AUTHORED RINGS
//
// circleRing() needed none of this: a generated convex polygon cannot self-
// intersect, which is why the create screen shipped without a validator. The moment
// a person places the vertices that guarantee dies, and the server's refusal is a 400
// whose message carries U+2010 hyphens instead of ASCII ones — a string that must
// never reach a user. So the shape is checked here, in full, before anything is sent.
//
// Everything works in raw (lon, lat) degrees with NO projection. Whether two segments
// cross is invariant under (lon, lat) -> (kx*lon, ky*lat) for positive kx, ky: that
// map is affine with positive determinant, so it preserves the sign of every
// orientation determinant, collinearity and betweenness. Projecting would add error
// and change no answer.
//
// VALIDATED, not assumed: compiled to JS and diffed against shapely 2.1.1 / GEOS
// 3.13.1 inside karma-backend-1 — the same library the backend DTO validator calls —
// over 4032 rings (13 live rings, 19 curated adversarial cases, 4000 fuzzed on coarse
// grids chosen to force shared coordinates and exact collinearity). 693 accepted,
// 0 false accepts. 48 rings are client-stricter, all of them in the deliberate
// quality buckets below. The contract this pins: the client is NEVER more permissive
// than the server. A false reject shows our own copy; a false accept would show the
// U+2010 string.
// ---------------------------------------------------------------------------

/** Sign of (b-a) x (c-a): 1 left turn, -1 right turn, 0 collinear. */
export function orient(a: LatLng, b: LatLng, c: LatLng): -1 | 0 | 1 {
  const d =
    (b.longitude - a.longitude) * (c.latitude - a.latitude) -
    (b.latitude - a.latitude) * (c.longitude - a.longitude);
  // NO epsilon, and that is measured rather than preferred. With a 1e-13 deg^2
  // tolerance this predicate diverged from GEOS on 16 of ~4000 fuzzed rings (all in
  // the safe direction, all avoidable): a vertex 5e-15 deg off an edge was read as ON
  // it. With exact double signs the agreement was total. "Nearly touching" is a
  // QUALITY question, not a topology one, and it is answered in metres by
  // ringClosestNonAdjacentPair below.
  return d > 0 ? 1 : d < 0 ? -1 : 0;
}

/** p is known collinear with ab; is it within the segment? (bounding-box test) */
function onSegment(a: LatLng, b: LatLng, p: LatLng): boolean {
  return (
    Math.min(a.longitude, b.longitude) <= p.longitude &&
    p.longitude <= Math.max(a.longitude, b.longitude) &&
    Math.min(a.latitude, b.latitude) <= p.latitude &&
    p.latitude <= Math.max(a.latitude, b.latitude)
  );
}

/** Do segments p1p2 and p3p4 share any point? Handles collinear overlap. */
export function segmentsIntersect(p1: LatLng, p2: LatLng, p3: LatLng, p4: LatLng): boolean {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  // strictly crossing: each segment straddles the other's line
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  // collinear or touching: an endpoint of one lies on the other
  if (d1 === 0 && onSegment(p3, p4, p1)) return true;
  if (d2 === 0 && onSegment(p3, p4, p2)) return true;
  if (d3 === 0 && onSegment(p1, p2, p3)) return true;
  if (d4 === 0 && onSegment(p1, p2, p4)) return true;
  return false;
}

/**
 * The first pair of ring edges that must not touch but do, as edge indices.
 * Edge i runs points[i] -> points[(i+1) % n], so the closing edge is edge n-1 and
 * needs no special case.
 *
 * Two exemptions, and they are the whole subtlety:
 *  - CONSECUTIVE edges legally share exactly one endpoint. They are illegal only when
 *    collinear AND the second retraces the first (a zero-width spike), which is what
 *    the dot-product test detects.
 *  - Edge 0 and edge n-1 are consecutive too, around the seam.
 *
 * O(n^2). n is capped at MAX_RING_POINTS and is at most 17 in this database, so a
 * full check runs on every state change without being noticed.
 */
export function ringFirstCrossing(points: LatLng[]): { a: number; b: number } | null {
  const n = points.length;
  if (n < 3) return null;
  for (let i = 0; i < n; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      const b1 = points[j];
      const b2 = points[(j + 1) % n];
      if (j === i + 1 || (i === 0 && j === n - 1)) {
        const shared = j === i + 1 ? a2 : a1;
        const far1 = j === i + 1 ? a1 : a2;
        const far2 = j === i + 1 ? b2 : b1;
        if (orient(far1, shared, far2) === 0) {
          const ux = shared.longitude - far1.longitude;
          const uy = shared.latitude - far1.latitude;
          const vx = far2.longitude - shared.longitude;
          const vy = far2.latitude - shared.latitude;
          if (ux * vx + uy * vy < 0) return { a: i, b: j };
        }
        continue;
      }
      if (segmentsIntersect(a1, a2, b1, b2)) return { a: i, b: j };
    }
  }
  return null;
}

export const ringSelfIntersects = (points: LatLng[]): boolean =>
  ringFirstCrossing(points) !== null;

// --- metric helpers: the "uncomfortably close" half, answered in metres ------

export function metresBetween(a: LatLng, b: LatLng): number {
  const lat0 = ((a.latitude + b.latitude) / 2) * DEG;
  return Math.hypot(
    (b.longitude - a.longitude) * DEG * Math.cos(lat0) * EARTH_R,
    (b.latitude - a.latitude) * DEG * EARTH_R,
  );
}

/** Perpendicular distance in metres from p to segment ab. */
export function metresToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const kx = DEG * Math.cos(((a.latitude + b.latitude) / 2) * DEG) * EARTH_R;
  const ky = DEG * EARTH_R;
  const ax = a.longitude * kx, ay = a.latitude * ky;
  const bx = b.longitude * kx, by = b.latitude * ky;
  const px = p.longitude * kx, py = p.latitude * ky;
  const vx = bx - ax, vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** Closest approach in metres between any two NON-ADJACENT edges, with indices. */
export function ringClosestNonAdjacentPair(
  points: LatLng[],
): { a: number; b: number; metres: number } | null {
  const n = points.length;
  let best: { a: number; b: number; metres: number } | null = null;
  for (let i = 0; i < n; i++) {
    const a1 = points[i], a2 = points[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue;
      const b1 = points[j], b2 = points[(j + 1) % n];
      const m = Math.min(
        metresToSegment(a1, b1, b2), metresToSegment(a2, b1, b2),
        metresToSegment(b1, a1, a2), metresToSegment(b2, a1, a2),
      );
      if (!best || m < best.metres) best = { a: i, b: j, metres: m };
    }
  }
  return best;
}

/** Closest two vertices, in metres. */
export function ringMinVertexGapM(points: LatLng[]): number {
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      min = Math.min(min, metresBetween(points[i], points[j]));
    }
  }
  return min;
}

/**
 * EXACTLY the vertex list ringToWkt will emit, minus the closing repeat.
 *
 * Every check must run on this, not on the editor's raw array. ringToWkt rounds to
 * 6 dp and drops adjacent duplicates, so validating the unrounded array can reject a
 * ring that would have serialised as perfectly valid — that was a real mismatch
 * against GEOS until the checks were moved behind this function. It is also what
 * turns a stored (closed) ring into an honest vertex count on load.
 */
export function canonicalRing(points: LatLng[]): LatLng[] {
  const key = (p: LatLng) => `${round6(p.longitude)} ${round6(p.latitude)}`;
  const out: LatLng[] = [];
  for (const p of points) {
    if (out.length && key(out[out.length - 1]) === key(p)) continue;
    out.push({ latitude: round6(p.latitude), longitude: round6(p.longitude) });
  }
  while (out.length > 1 && key(out[out.length - 1]) === key(out[0])) out.pop();
  return out;
}

/** Two rings are the same boundary iff their canonical vertex lists match in order. */
export function ringsEqual(a: LatLng[], b: LatLng[]): boolean {
  const x = canonicalRing(a);
  const y = canonicalRing(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    if (x[i].latitude !== y[i].latitude || x[i].longitude !== y[i].longitude) return false;
  }
  return true;
}

/** Area-weighted centroid; vertex mean when the signed area is ~0. */
export function ringCentroid(points: LatLng[]): LatLng {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    const f = p.longitude * q.latitude - q.longitude * p.latitude;
    a += f;
    cx += (p.longitude + q.longitude) * f;
    cy += (p.latitude + q.latitude) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const n = points.length || 1;
    return {
      latitude: points.reduce((s, p) => s + p.latitude, 0) / n,
      longitude: points.reduce((s, p) => s + p.longitude, 0) / n,
    };
  }
  return { latitude: cy / (3 * a), longitude: cx / (3 * a) };
}

/**
 * Ray-cast containment, half-open on latitude so a point level with a vertex counts
 * once rather than twice.
 *
 * This must agree with the server, because the "areas covering me" chip asks the
 * server the same question with ?intersects_polygon=POINT(lon lat) and a screen that
 * grouped rows differently from its own chip would contradict itself.
 */
export function pointInRing(pt: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].longitude, yi = ring[i].latitude;
    const xj = ring[j].longitude, yj = ring[j].latitude;
    if (
      yi > pt.latitude !== yj > pt.latitude &&
      pt.longitude < ((xj - xi) * (pt.latitude - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/** Inside any part of the geometry and not inside one of its holes. */
export function polygonsCoverPoint(polys: PolygonRings[], pt: LatLng): boolean {
  return polys.some(
    (p) => pointInRing(pt, p.coordinates) && !p.holes.some((h) => pointInRing(pt, h)),
  );
}

/**
 * km² with as many digits as the magnitude deserves, and no more.
 *
 * The live corpus spans 4.34 to 405.02 km² and the create screen's smallest circle is
 * 0.03 km². A fixed one decimal place prints "405.0" and "0.0"; both are wrong for
 * different reasons. Every screen that shows a size uses this, so the list, the detail
 * screen and the editor can never disagree.
 */
export function formatKm2(km2: number): string {
  return km2 < 1 ? km2.toFixed(2) : km2 < 10 ? km2.toFixed(1) : String(Math.round(km2));
}

// --- the one gate the UI calls ----------------------------------------------

/** 6 dp is 0.11 m, so this floor is 70x the coordinate quantum. Corpus min is 112 m. */
export const MIN_VERTEX_GAP_M = 8;
/** Below this, two edges are close enough that validity depends on float luck. */
export const NEAR_TOUCH_M = 2;
/** A 32 m square. The smallest real area is 4.34 km². */
export const MIN_AREA_M2 = 1000;
/** Bounds the O(n^2) loop. Corpus max is 17; circleRing emits 48. */
export const MAX_RING_POINTS = 200;

export type RingProblem =
  | { kind: 'tooFew' }
  | { kind: 'tooMany'; max: number }
  | { kind: 'outOfRange' }
  | { kind: 'tooClose' }
  | { kind: 'crosses'; a: number; b: number }
  | { kind: 'nearlyCrosses'; a: number; b: number }
  | { kind: 'tooSmall' };

/**
 * null means the server will accept this ring AND it is worth accepting.
 * Ordered most-actionable first, so the editor shows one message at a time.
 */
export function checkRing(points: LatLng[]): RingProblem | null {
  const ring = canonicalRing(points);
  if (ring.length < 3) return { kind: 'tooFew' };
  if (ring.length > MAX_RING_POINTS) return { kind: 'tooMany', max: MAX_RING_POINTS };
  if (!ringIsSane(ring)) return { kind: 'outOfRange' };
  if (ringMinVertexGapM(ring) < MIN_VERTEX_GAP_M) return { kind: 'tooClose' };
  const x = ringFirstCrossing(ring);
  if (x) return { kind: 'crosses', a: x.a, b: x.b };
  const near = ringClosestNonAdjacentPair(ring);
  if (near && near.metres < NEAR_TOUCH_M) {
    return { kind: 'nearlyCrosses', a: near.a, b: near.b };
  }
  if (ringAreaM2(ring) < MIN_AREA_M2) return { kind: 'tooSmall' };
  return null;
}

/**
 * A map region that frames every given point, with a little breathing room.
 *
 * Shared rather than copied: the detail screen, the boundary editor and anything else
 * that opens a map onto a stored ring must frame it identically, or the same area looks
 * like a different shape depending on which screen you arrived from. The floor on the
 * deltas matters — a degenerate ring (every point equal) would otherwise give a zero
 * span, which renders as a blank map rather than a tiny one.
 */
export function regionFor(points: LatLng[]): {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} {
  if (!points.length) {
    // Damascus, the repo's existing fallback centre
    return { latitude: 33.5138, longitude: 36.2765, latitudeDelta: 0.09, longitudeDelta: 0.09 };
  }
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.01),
    longitudeDelta: Math.max((maxLng - minLng) * 1.4, 0.01),
  };
}
