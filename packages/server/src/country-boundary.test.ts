import { describe, expect, it } from "vitest";
import type { GeoMultiPolygon, RegionExtent } from "@geo/engine";
import { framingBboxOf, isAntimeridianCrossing, simplifyForFraming } from "./country-boundary.js";

/** A single axis-aligned square as a GeoJSON MultiPolygon. */
function square(minLon: number, minLat: number, maxLon: number, maxLat: number): GeoMultiPolygon {
  return {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [minLon, minLat],
          [maxLon, minLat],
          [maxLon, maxLat],
          [minLon, maxLat],
          [minLon, minLat],
        ],
      ],
    ],
  };
}

/**
 * A 4°×2° block whose top edge is a fine zigzag of `teeth` teeth, amplitude
 * `amp` degrees — low-area detail that survives a fine tolerance and flattens
 * under a coarse one.
 */
function serratedBlock(teeth: number, amp: number): GeoMultiPolygon {
  const ring: number[][] = [
    [0, 0],
    [4, 0],
  ];
  const n = teeth * 2;
  for (let i = 0; i <= n; i++) {
    const x = 4 - (4 * i) / n;
    const y = i % 2 === 0 ? 2 : 2 + amp;
    ring.push([x, y]);
  }
  ring.push([0, 0]);
  return { type: "MultiPolygon", coordinates: [[ring]] };
}

const countVertices = (geo: GeoMultiPolygon): number =>
  geo.coordinates.reduce((n, poly) => n + poly.reduce((m, ring) => m + ring.length, 0), 0);

const extent = (minLon: number, minLat: number, maxLon: number, maxLat: number): RegionExtent => ({
  minLon,
  minLat,
  maxLon,
  maxLat,
});

describe("framingBboxOf", () => {
  it("pads the raw bbox by 8% of each span on every side", () => {
    const box = framingBboxOf(square(0, 0, 10, 20));
    expect(box.minLon).toBeCloseTo(-0.8);
    expect(box.maxLon).toBeCloseTo(10.8);
    expect(box.minLat).toBeCloseTo(-1.6);
    expect(box.maxLat).toBeCloseTo(21.6);
  });

  it("clamps padding to valid lon/lat ranges", () => {
    const box = framingBboxOf(square(-179, -89, 179, 89));
    expect(box.minLon).toBeGreaterThanOrEqual(-180);
    expect(box.maxLon).toBeLessThanOrEqual(180);
    expect(box.minLat).toBeGreaterThanOrEqual(-90);
    expect(box.maxLat).toBeLessThanOrEqual(90);
  });
});

describe("isAntimeridianCrossing", () => {
  it("flags a geometry whose raw lon span exceeds 180°", () => {
    // Two far-apart parts, as a seam-crosser's raw bbox looks (≈ −170 … 170).
    const spanning: GeoMultiPolygon = {
      type: "MultiPolygon",
      coordinates: [...square(-175, 0, -170, 5).coordinates, ...square(170, 0, 175, 5).coordinates],
    };
    expect(isAntimeridianCrossing(spanning)).toBe(true);
  });

  it("does not flag an ordinary compact country", () => {
    expect(isAntimeridianCrossing(square(2, 42, 9, 51))).toBe(false);
  });
});

describe("simplifyForFraming", () => {
  it("produces a coarser outline for a wide framing than a narrow one", () => {
    const detailed = serratedBlock(30, 0.03);
    const fine = simplifyForFraming(detailed, extent(0, 0, 2, 2)); // narrow → fine
    const coarse = simplifyForFraming(detailed, extent(-30, -30, 30, 30)); // wide → coarse
    expect(countVertices(coarse)).toBeLessThan(countVertices(fine));
  });

  it("drops a sub-pixel island while keeping a supra-pixel one", () => {
    const archipelago: GeoMultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        ...square(0, 0, 2, 2).coordinates, // large island
        ...square(3, 3, 3.001, 3.001).coordinates, // sub-pixel speck
      ],
    };
    const out = simplifyForFraming(archipelago, extent(0, 0, 4, 4));
    expect(out.coordinates).toHaveLength(1);
  });

  it("keeps every part of a multipart country whose parts are all supra-pixel", () => {
    const twoIslands: GeoMultiPolygon = {
      type: "MultiPolygon",
      coordinates: [...square(0, 0, 2, 2).coordinates, ...square(5, 5, 7, 7).coordinates],
    };
    const out = simplifyForFraming(twoIslands, extent(0, 0, 8, 8));
    expect(out.coordinates).toHaveLength(2);
  });

  it("returns closed rings rounded to 3 decimals", () => {
    const out = simplifyForFraming(square(0.123456, 0.654321, 2, 2), extent(0, 0, 2, 2));
    const ring = out.coordinates[0]![0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]); // closed
    for (const [lon, lat] of ring) {
      expect(lon).toBeCloseTo(round3(lon!), 10);
      expect(lat).toBeCloseTo(round3(lat!), 10);
    }
  });
});

const round3 = (n: number) => Math.round(n * 1000) / 1000;
