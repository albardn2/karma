// imported explicitly rather than relying on ambient globals — same reason as
// wkt.test.ts: @types/jest is not a dependency, @jest/globals ships its own types
import { describe, expect, it } from '@jest/globals';
import { thumbPath } from '@/utils/areaThumb';
import { areaColour, AREA_PALETTE } from '@/utils/areaColour';
import { circleRing, parseWktPolygons } from '@/utils/wkt';

/** bounding box of an SVG path made only of M/L/Z commands */
const bbox = (d: string) => {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0);
  const ys = nums.filter((_, i) => i % 2 === 1);
  return {
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
};

describe('thumbPath', () => {
  it('returns null when there is no drawable ring', () => {
    expect(thumbPath([], 56, 4)).toBeNull();
    expect(thumbPath(parseWktPolygons('NOT A POLYGON'), 56, 4)).toBeNull();
    expect(thumbPath(parseWktPolygons(''), 56, 4)).toBeNull();
  });

  it('fits inside the padded box', () => {
    const d = thumbPath(parseWktPolygons('POLYGON((36 33,37 33,37 34,36 34,36 33))'), 56, 4)!;
    const b = bbox(d);
    expect(b.minX).toBeGreaterThanOrEqual(4);
    expect(b.minY).toBeGreaterThanOrEqual(4);
    expect(b.maxX).toBeLessThanOrEqual(52);
    expect(b.maxY).toBeLessThanOrEqual(52);
  });

  // the whole point of the thumbnail: a wide area must not be stretched into a box,
  // or every area looks the same
  it('preserves aspect ratio and centres the short axis', () => {
    // 2 degrees of longitude by 1 of latitude, at latitude ~0 so cos(lat) ≈ 1
    const d = thumbPath(parseWktPolygons('POLYGON((0 0,2 0,2 1,0 1,0 0))'), 56, 4)!;
    const b = bbox(d);
    expect(b.w / b.h).toBeCloseTo(2, 1);
    expect(b.w).toBeCloseTo(48, 1); // long axis fills the padded box
    // short axis centred: equal slack above and below
    expect(b.minY - 4).toBeCloseTo(52 - b.maxY, 1);
  });

  it('corrects for longitude convergence so the shape matches the map', () => {
    // a ring 1 deg by 1 deg at latitude 60 is HALF as wide as it is tall on the
    // ground (cos 60 = 0.5), and must be drawn that way
    const d = thumbPath(parseWktPolygons('POLYGON((0 60,1 60,1 61,0 61,0 60))'), 56, 4)!;
    const b = bbox(d);
    expect(b.w / b.h).toBeLessThan(0.65);
    expect(b.w / b.h).toBeGreaterThan(0.4);
  });

  it('emits one closed subpath per ring, holes included', () => {
    const withHole =
      'POLYGON((0 0,10 0,10 10,0 10,0 0),(3 3,6 3,6 6,3 6,3 3))';
    const d = thumbPath(parseWktPolygons(withHole), 56, 4)!;
    expect((d.match(/Z/g) ?? []).length).toBe(2);
    expect(d.startsWith('M')).toBe(true);
  });

  it('survives a degenerate ring without producing NaN', () => {
    const d = thumbPath(parseWktPolygons('POLYGON((36 33,36 33,36 33,36 33))'), 56, 4);
    expect(d == null || !d.includes('NaN')).toBe(true);
  });
});

describe('areaColour', () => {
  it('is stable for a uuid and always in the palette', () => {
    const u = 'ccc2c680-775a-44c0-86ae-3318bd8c27ab';
    expect(areaColour(u)).toBe(areaColour(u));
    expect(AREA_PALETTE).toContain(areaColour(u));
  });

  it('does not depend on position in any list', () => {
    const a = 'aaaaaaaa-0000-0000-0000-000000000001';
    const b = 'bbbbbbbb-0000-0000-0000-000000000002';
    const first = [a, b].map(areaColour);
    const reversed = [b, a].map(areaColour).reverse();
    expect(first).toEqual(reversed);
  });
});

