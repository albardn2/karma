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
