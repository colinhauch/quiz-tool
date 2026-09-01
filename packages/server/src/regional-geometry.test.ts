import { describe, expect, it } from "vitest";
import type { GeoMultiPolygon } from "@geo/engine";
import { clipToExtent, regionExtentFor, regionalGeometryFor } from "./regional-geometry.js";

/** A single square land polygon, given as a GeoJSON MultiPolygon. */
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

describe("regionExtentFor", () => {
  it("centers the window on the entity's coordinate", () => {
    const extent = regionExtentFor({ lat: 10, lon: 20 }, ["city"]);
    expect((extent.minLon + extent.maxLon) / 2).toBeCloseTo(20);
    expect((extent.minLat + extent.maxLat) / 2).toBeCloseTo(10);
  });

  it("scales the span by entity type: city < country < continent", () => {
    const span = (types: string[]) => {
      const e = regionExtentFor({ lat: 0, lon: 0 }, types);
      return e.maxLat - e.minLat;
    };
    expect(span(["city"])).toBeLessThan(span(["country"]));
    expect(span(["country"])).toBeLessThan(span(["continent"]));
  });

  it("picks the widest span when an entity has several types", () => {
    const city = regionExtentFor({ lat: 0, lon: 0 }, ["city"]);
    const mixed = regionExtentFor({ lat: 0, lon: 0 }, ["city", "continent"]);
    expect(mixed.maxLat - mixed.minLat).toBeGreaterThan(city.maxLat - city.minLat);
  });

  it("makes the window twice as wide as it is tall, matching the 2:1 frame", () => {
    const extent = regionExtentFor({ lat: 0, lon: 0 }, ["city"]);
    const lonSpan = extent.maxLon - extent.minLon;
    const latSpan = extent.maxLat - extent.minLat;
    expect(lonSpan / latSpan).toBeCloseTo(2);
  });

  it("clamps to valid lon/lat ranges near the poles and antimeridian", () => {
    const extent = regionExtentFor({ lat: 89, lon: 179 }, ["continent"]);
    expect(extent.maxLat).toBeLessThanOrEqual(90);
    expect(extent.minLat).toBeGreaterThanOrEqual(-90);
    expect(extent.maxLon).toBeLessThanOrEqual(180);
    expect(extent.minLon).toBeGreaterThanOrEqual(-180);
  });
});

describe("clipToExtent", () => {
  const extent = { minLon: 0, minLat: 0, maxLon: 10, maxLat: 10 };

  it("keeps a polygon wholly inside the window unchanged in coverage", () => {
    const clipped = clipToExtent(square(2, 2, 8, 8), extent);
    expect(clipped.coordinates).toHaveLength(1);
    for (const [lon, lat] of clipped.coordinates[0]![0]!) {
      expect(lon).toBeGreaterThanOrEqual(2);
      expect(lon).toBeLessThanOrEqual(8);
      expect(lat).toBeGreaterThanOrEqual(2);
      expect(lat).toBeLessThanOrEqual(8);
    }
  });

  it("drops a polygon wholly outside the window", () => {
    const clipped = clipToExtent(square(50, 50, 60, 60), extent);
    expect(clipped.coordinates).toHaveLength(0);
  });

  it("clips a straddling polygon to the window bounds", () => {
    // Spans lon [-5, 5]; only the right half is inside.
    const clipped = clipToExtent(square(-5, 2, 5, 8), extent);
    expect(clipped.coordinates).toHaveLength(1);
    const lons = clipped.coordinates[0]![0]!.map(([lon]) => lon!);
    expect(Math.min(...lons)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...lons)).toBeCloseTo(5);
  });

  it("keeps every ring closed (first vertex equals last)", () => {
    const clipped = clipToExtent(square(-5, 2, 5, 8), extent);
    const ring = clipped.coordinates[0]![0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("preserves a hole that falls inside the window", () => {
    const withHole: GeoMultiPolygon = {
      type: "MultiPolygon",
      coordinates: [
        [
          // Outer ring covering the whole window and beyond.
          [
            [-5, -5],
            [15, -5],
            [15, 15],
            [-5, 15],
            [-5, -5],
          ],
          // A hole near the middle, fully inside the window.
          [
            [3, 3],
            [7, 3],
            [7, 7],
            [3, 7],
            [3, 3],
          ],
        ],
      ],
    };
    const clipped = clipToExtent(withHole, extent);
    expect(clipped.coordinates[0]).toHaveLength(2); // outer + hole survive
  });
});

describe("regionalGeometryFor", () => {
  const land = square(-90, -90, 90, 90); // a big land mass covering any small window

  it("returns local GeoJSON in lon/lat plus the region extent", () => {
    const result = regionalGeometryFor({ lat: 0, lon: 0 }, ["city"], land);
    expect(result.localGeoJSON.type).toBe("MultiPolygon");
    expect(result.localGeoJSON.coordinates.length).toBeGreaterThan(0);
    expect(result.regionExtent).toEqual(regionExtentFor({ lat: 0, lon: 0 }, ["city"]));
    // Clipped geometry stays within the extent.
    for (const [lon, lat] of result.localGeoJSON.coordinates[0]![0]!) {
      expect(lon).toBeGreaterThanOrEqual(result.regionExtent.minLon - 1e-6);
      expect(lon).toBeLessThanOrEqual(result.regionExtent.maxLon + 1e-6);
      expect(lat).toBeGreaterThanOrEqual(result.regionExtent.minLat - 1e-6);
      expect(lat).toBeLessThanOrEqual(result.regionExtent.maxLat + 1e-6);
    }
  });

  it("yields an empty MultiPolygon where the window holds only ocean", () => {
    const island = square(100, 10, 101, 11); // valid but far outside the window at (0,0)
    const result = regionalGeometryFor({ lat: 0, lon: 0 }, ["city"], island);
    expect(result.localGeoJSON.coordinates).toHaveLength(0);
  });
});
