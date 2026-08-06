// imported explicitly rather than relying on ambient globals: @types/jest is not a
// dependency of this project, and @jest/globals ships its own types — so this keeps the
// repo's `tsc --noEmit` clean without adding a package for one file
import { describe, expect, it } from '@jest/globals';
import {
  canonicalRing,
  checkRing,
  circleRing,
  destination,
  formatKm2,
  MAX_RING_POINTS,
  orient,
  parseWktPolygons,
  pointInRing,
  ringAreaM2,
  ringCentroid,
  ringClosestNonAdjacentPair,
  ringFirstCrossing,
  ringIsSane,
  ringMinVertexGapM,
  ringSelfIntersects,
  ringsEqual,
  ringToWkt,
  ringVertexCount,
  segmentsIntersect,
} from '../wkt';

/**
 * The one unit test in this app, and it earns its place.
 *
 * A coordinate transposition here is silent data corruption: the backend accepts a
 * latitude-first ring with HTTP 201 and stores it in the wrong hemisphere, so no
 * server response, log line or screen will ever reveal the mistake. The only thing
 * that can catch it is an assertion on the exact string.
 */

const metres = (a: { latitude: number; longitude: number }, b: typeof a) => {
  const R = 6371008.8;
  const p = (Math.PI / 180) * a.latitude;
  const q = (Math.PI / 180) * b.latitude;
  const dp = q - p;
  const dl = (Math.PI / 180) * (b.longitude - a.longitude);
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p) * Math.cos(q) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const DAMASCUS = { latitude: 33.5138, longitude: 36.2765 };

describe('ringToWkt', () => {
  it('emits longitude first, closes the ring, and adds no SRID', () => {
    const wkt = ringToWkt([
      { latitude: 33.5, longitude: 36.3 },
      { latitude: 33.5, longitude: 36.4 },
      { latitude: 33.6, longitude: 36.4 },
    ]);
    expect(wkt).toBe('POLYGON((36.3 33.5,36.4 33.5,36.4 33.6,36.3 33.5))');
  });

  it('is idempotent through the parser — the accretion guard', () => {
    // without popping the trailing closing point, each save would add a vertex,
    // and every intermediate state is a valid 201 so nothing would complain
    const ring = circleRing(DAMASCUS.latitude, DAMASCUS.longitude, 2000, 48);
    const once = ringToWkt(ring);
    let cur = once;
    for (let i = 0; i < 3; i++) {
      cur = ringToWkt(parseWktPolygons(cur)[0].coordinates);
    }
    expect(cur).toBe(once);
    expect(parseWktPolygons(once)[0].coordinates).toHaveLength(49);
  });

  it('drops an adjacent duplicate and still closes', () => {
    const wkt = ringToWkt([
      { latitude: 33.5, longitude: 36.3 },
      { latitude: 33.5, longitude: 36.3 },
      { latitude: 33.5, longitude: 36.4 },
      { latitude: 33.6, longitude: 36.4 },
    ]);
    expect(wkt).toBe('POLYGON((36.3 33.5,36.4 33.5,36.4 33.6,36.3 33.5))');
  });

  it('throws rather than emitting a ring the server would 400', () => {
    expect(() =>
      ringToWkt([
        { latitude: 33.5, longitude: 36.3 },
        { latitude: 33.5, longitude: 36.4 },
      ]),
    ).toThrow();
  });

  it('accepts the canonical read form and reproduces the sent string', () => {
    // the store returns "POLYGON ((x y, x y))" — space after POLYGON, ", " between
    // pairs — and that must re-serialise to our own compact form unchanged
    const ring = circleRing(DAMASCUS.latitude, DAMASCUS.longitude, 1500, 48);
    const sent = ringToWkt(ring);
    const canonical = sent
      .replace('POLYGON((', 'POLYGON ((')
      .replace(/,/g, ', ');
    expect(ringToWkt(parseWktPolygons(canonical)[0].coordinates)).toBe(sent);
  });
});

describe('circleRing', () => {
  it('returns `segments` points, all at the requested radius', () => {
    const ring = circleRing(DAMASCUS.latitude, DAMASCUS.longitude, 2000, 48);
    expect(ring).toHaveLength(48);
    for (const p of ring) {
      expect(Math.abs(metres(DAMASCUS, p) - 2000)).toBeLessThan(2);
    }
  });

  it('keeps every vertex distinct even at a 1 m radius after 6-dp rounding', () => {
    const ring = circleRing(DAMASCUS.latitude, DAMASCUS.longitude, 1, 48);
    const seen = new Set(ring.map((p) => `${p.longitude} ${p.latitude}`));
    expect(seen.size).toBe(48);
  });

  it('does not skew into an ellipse — the reason destination() is spherical', () => {
    const ring = circleRing(DAMASCUS.latitude, DAMASCUS.longitude, 8000, 48);
    const ds = ring.map((p) => metres(DAMASCUS, p));
    expect(Math.max(...ds) - Math.min(...ds)).toBeLessThan(5);
  });
});

describe('ringIsSane', () => {
  it('accepts a Damascus ring', () => {
    expect(ringIsSane(circleRing(DAMASCUS.latitude, DAMASCUS.longitude, 2000, 48))).toBe(true);
  });

  it('rejects an out-of-range latitude the server would store anyway', () => {
    expect(
      ringIsSane([
        { latitude: 95, longitude: 36.3 },
        { latitude: 33.5, longitude: 36.4 },
        { latitude: 33.6, longitude: 36.4 },
      ]),
    ).toBe(false);
  });

  it('rejects an antimeridian straddle', () => {
    expect(
      ringIsSane([
        { latitude: 10, longitude: 179.9 },
        { latitude: 10, longitude: -179.9 },
        { latitude: 11, longitude: 179.9 },
      ]),
    ).toBe(false);
  });
});

describe('ringAreaM2 / ringVertexCount', () => {
  it('approximates a circle to under 1%', () => {
    // a 48-gon is itself 0.14% smaller than its circle; the rest is the
    // equirectangular approximation. Both together stay well inside 1%.
    const r = 2000;
    const ring = circleRing(DAMASCUS.latitude, DAMASCUS.longitude, r, 48);
    const truth = Math.PI * r * r;
    expect(Math.abs(ringAreaM2(ring) - truth) / truth).toBeLessThan(0.01);
  });

  it('does not count the closing duplicate as a vertex', () => {
    const ring = circleRing(DAMASCUS.latitude, DAMASCUS.longitude, 2000, 48);
    const parsed = parseWktPolygons(ringToWkt(ring))[0].coordinates;
    expect(parsed).toHaveLength(49);
    expect(ringVertexCount(parsed)).toBe(48);
  });
});

describe('destination', () => {
  it('moves north for bearing 0 and east for bearing 90', () => {
    const n = destination(33.5, 36.3, 0, 1000);
    const e = destination(33.5, 36.3, 90, 1000);
    expect(n.latitude).toBeGreaterThan(33.5);
    expect(Math.abs(n.longitude - 36.3)).toBeLessThan(1e-9);
    expect(e.longitude).toBeGreaterThan(36.3);
  });
});

const R = (pairs: [number, number][]) =>
  pairs.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));

// Every expected value below is the verdict GEOS 3.13.1 gave for the same ring inside
// karma-backend-1 (shapely 2.1.1, the library the backend DTO validator calls). This
// suite therefore pins the client to the server's own definition of "valid", which is
// the only reason it is safe to disable Save on our own say-so.
describe('ringFirstCrossing / ringSelfIntersects', () => {
  it('accepts a convex ring', () => {
    expect(ringSelfIntersects(R([[0,0],[2,0],[2,2],[0,2]]))).toBe(false);
  });
  it('accepts a concave ring', () => {                    // GEOS: valid
    expect(ringSelfIntersects(R([[0,0],[4,0],[4,4],[2,1],[0,4]]))).toBe(false);
  });
  it('accepts collinear redundant vertices', () => {      // GEOS: valid
    expect(ringSelfIntersects(R([[0,0],[2,0],[4,0],[4,4],[0,4]]))).toBe(false);
  });
  it('accepts a figure-8 that only touches at a vertex', () => { // GEOS: valid
    expect(ringSelfIntersects(R([[0,0],[2,0],[2,2],[1,1],[0,2]]))).toBe(false);
  });
  it('accepts a 5-point star and a 48-gon', () => {
    expect(ringSelfIntersects(circleRing(33.5, 36.2, 2000, 48))).toBe(false);
  });
  it('rejects a bowtie', () => {                          // GEOS: invalid -> 400
    expect(ringSelfIntersects(R([[36,33],[36.1,33.1],[36.1,33],[36,33.1]]))).toBe(true);
  });
  it('rejects a zero-width spike that retraces an edge', () => {
    expect(ringSelfIntersects(R([[36,33],[38,33],[37,34],[38,33]]))).toBe(true);
  });
  it('rejects a vertex sitting exactly on a non-adjacent edge', () => {
    expect(ringSelfIntersects(R([[0,0],[4,0],[4,4],[2,0],[0,4]]))).toBe(true);
  });
  it('rejects a non-adjacent duplicate vertex', () => {
    expect(ringSelfIntersects(R([[0,0],[1,0],[1,1],[0,0],[0,1]]))).toBe(true);
  });
  it('reports the offending edge pair so the map can highlight it', () => {
    const x = ringFirstCrossing(R([[36,33],[36.1,33.1],[36.1,33],[36,33.1]]));
    expect(x).not.toBeNull();
    expect(x!.a).toBeLessThan(x!.b);
  });
});

describe('canonicalRing', () => {
  it('drops the closing duplicate a stored ring carries, so the count is honest', () => {
    const stored = R([[36.2,33.5],[36.3,33.5],[36.3,33.6],[36.2,33.5]]);
    expect(canonicalRing(stored)).toHaveLength(3);
  });
  it('rounds to the 6 dp ringToWkt will emit, and collapses adjacent duplicates', () => {
    const r = canonicalRing(R([[36.20000004, 33.5], [36.2, 33.5], [36.3, 33.5], [36.3, 33.6]]));
    expect(r).toHaveLength(3);
  });
});

describe('ringsEqual', () => {
  it('is true for the same boundary parsed from the server and re-serialised', () => {
    const a = R([[36.2,33.5],[36.3,33.5],[36.3,33.6]]);
    const b = R([[36.2,33.5],[36.3,33.5],[36.3,33.6],[36.2,33.5]]); // closed form
    expect(ringsEqual(a, b)).toBe(true);   // a string compare would say "changed"
  });
  it('is false when one vertex moved', () => {
    expect(ringsEqual(
      R([[36.2,33.5],[36.3,33.5],[36.3,33.6]]),
      R([[36.2,33.5],[36.3,33.5],[36.31,33.6]]),
    )).toBe(false);
  });
});

describe('checkRing', () => {
  it('accepts every one of the shapes this app can generate', () => {
    expect(checkRing(circleRing(33.5, 36.2, 2000, 48))).toBeNull();
    expect(checkRing(circleRing(33.5, 36.2, 2000, 12))).toBeNull();
  });
  it('accepts a hand-authored concave L (POSTs 201 on the live API)', () => {
    expect(checkRing(R([
      [36.20,33.50],[36.30,33.50],[36.30,33.55],[36.25,33.55],[36.25,33.60],[36.20,33.60],
    ]))).toBeNull();
  });
  it('names tooFew below 3 distinct points', () => {
    expect(checkRing(R([[36.2,33.5],[36.3,33.5]]))?.kind).toBe('tooFew');
  });
  it('names tooMany above the cap', () => {
    expect(checkRing(circleRing(33.5, 36.2, 2000, MAX_RING_POINTS + 1))?.kind).toBe('tooMany');
  });
  it('names outOfRange for an impossible coordinate', () => {
    expect(checkRing(R([[500,33.5],[36.3,33.5],[36.3,33.6]]))?.kind).toBe('outOfRange');
  });
  it('names tooClose for two vertices a few metres apart', () => {
    expect(checkRing(R([[36.2,33.5],[36.20001,33.5],[36.3,33.6]]))?.kind).toBe('tooClose');
  });
  it('names crosses for a bowtie, with both edge indices', () => {
    const p = checkRing(R([[36,33],[36.1,33.1],[36.1,33],[36,33.1]]));
    expect(p?.kind).toBe('crosses');
  });
  it('names tooSmall for a ring under 1000 m²', () => {
    expect(checkRing(R([[36.2,33.5],[36.2002,33.5],[36.2002,33.5002]]))?.kind).toBe('tooSmall');
  });
});

describe('formatKm2', () => {
  it('shows two decimals under 1, one under 10, none above', () => {
    expect(formatKm2(0.03)).toBe('0.03');
    expect(formatKm2(4.34)).toBe('4.3');
    expect(formatKm2(405.02)).toBe('405');
  });
});

describe('pointInRing', () => {
  it('agrees with the server for a point inside and outside a known ring', () => {
    const ring = R([[36.25,33.55],[36.26,33.55],[36.26,33.56],[36.25,33.56]]);
    expect(pointInRing({ latitude: 33.555, longitude: 36.255 }, ring)).toBe(true);
    expect(pointInRing({ latitude: 33.500, longitude: 36.100 }, ring)).toBe(false);
  });
});
