import L from "leaflet";

/**
 * WKT <-> Leaflet conversions, shared by every service-area map.
 *
 * These lived as three near-identical copies (the list map, the detail map and
 * the draw map). The "POLYGON ((" whitespace bug below had to be found and
 * fixed in each one separately, which is the whole argument for this module.
 */

/**
 * Parse a WKT polygon's OUTER ring, reporting what it could not read.
 *
 * `dropped` is the point of this signature. Every previous copy ended in
 * `.filter(c => c !== null)`, which is harmless when you only draw the result
 * but wrong when you round-trip it: parse -> L.polygon -> polygonToWKT -> PUT
 * would silently write back a shape missing the vertices it failed to read. A
 * caller that means to SAVE the result must refuse when `dropped > 0`.
 *
 * The concrete case is a polygon with an interior ring: stripping the
 * `POLYGON((` / `))` wrapper leaves `...c d), (e f...` in the middle, whose two
 * boundary tokens parse as NaN. Dropping them silently splices the outer and
 * inner rings into one self-intersecting ring.
 */
export function parsePolygonRing(wkt: string): { ring: L.LatLng[]; dropped: number } {
  if (!wkt || typeof wkt !== "string") return { ring: [], dropped: 0 };
  try {
    // shapely emits "POLYGON ((x y, ...))" WITH a space, which is what this API
    // returns, so the prefix must tolerate it — without \s* the first vertex
    // fails to parse and is dropped.
    const body = wkt.replace(/POLYGON\s*\(\(|\)\)/gi, "");
    let dropped = 0;
    const ring: L.LatLng[] = [];
    for (const token of body.split(",")) {
      const parts = token.trim().split(/\s+/);
      if (parts.length !== 2) {
        dropped += 1;
        continue;
      }
      const [lng, lat] = parts.map(Number);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
        dropped += 1;
        continue;
      }
      ring.push(new L.LatLng(lat, lng));
    }
    return { ring, dropped };
  } catch {
    return { ring: [], dropped: 0 };
  }
}

/**
 * The outer ring alone — for the read-only case, where an unreadable vertex is
 * better skipped than fatal. Use parsePolygonRing when the result will be saved.
 */
export function parsePolygonWKT(wkt: string): L.LatLng[] {
  return parsePolygonRing(wkt).ring;
}

/** Leaflet polygon -> closed WKT ring. */
export function polygonToWKT(polygon: L.Polygon): string {
  const latlngs = polygon.getLatLngs()[0] as L.LatLng[];
  const coords = latlngs.map((latlng) => `${latlng.lng} ${latlng.lat}`);
  // Leaflet keeps rings OPEN (_convertLatLngs pops a trailing duplicate), so
  // the closing point has to be put back for WKT.
  if (coords.length > 0 && coords[0] !== coords[coords.length - 1]) {
    coords.push(coords[0]);
  }
  return `POLYGON((${coords.join(",")}))`;
}

/**
 * Map viewport -> WKT polygon, the shape the `intersects_polygon` /
 * `within_polygon` filters take.
 *
 * Deliberately NOT named boundsToWKT: the three old copies of that name were
 * three different functions (4 vs 5 corners, different separators, only one
 * normalising longitude), so a shared name would have invited the wrong one.
 */
export function viewportToWKT(b: L.LatLngBounds): string {
  const sw = b.getSouthWest();
  const ne = b.getNorthEast();
  // Leaflet does NOT wrap getBounds(): pan onto the next world copy and you get
  // lng 300..340, which intersects nothing and silently empties the layer while
  // the map still shows Damascus. Zoomed fully out the span exceeds 360, where
  // wrapping each corner would instead produce a backwards ring.
  let west = sw.lng;
  let east = ne.lng;
  if (east - west >= 360) {
    west = -180;
    east = 180;
  } else {
    const shift = 360 * Math.floor((west + 180) / 360);
    west -= shift;
    east -= shift;
  }
  return `POLYGON((${west} ${sw.lat},${east} ${sw.lat},${east} ${ne.lat},${west} ${ne.lat},${west} ${sw.lat}))`;
}

/** Quantise a viewport WKT so micro-pans stop minting new query-cache entries. */
export function quantizeViewport(wkt: string, decimals = 4): string {
  return wkt.replace(/-?\d+\.\d+/g, (n) => Number(n).toFixed(decimals));
}
