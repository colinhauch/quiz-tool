import { geoPath } from "d3-geo";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECTION_ID,
  PROJECTIONS,
  geoBounds,
  geoPathString,
  project,
  projectionFor,
} from "./projection.js";
import { WORLD_LAND_PATHS } from "./world-map.generated.js";

describe("projection registry", () => {
  it("offers equal-earth (default) and equirectangular", () => {
    expect(PROJECTIONS.map((p) => p.id)).toEqual(["equal-earth", "equirectangular"]);
    expect(DEFAULT_PROJECTION_ID).toBe("equal-earth");
    for (const p of PROJECTIONS) {
      expect(p).toMatchObject({ id: expect.any(String), label: expect.any(String) });
      expect(typeof p.factory).toBe("function");
      expect(typeof p.point).toBe("function");
    }
  });

  it("resolves known ids, and falls back to the default for an unknown one", () => {
    expect(projectionFor("equal-earth").id).toBe("equal-earth");
    expect(projectionFor("equirectangular").id).toBe("equirectangular");
    expect(projectionFor("mystery-mercator").id).toBe(DEFAULT_PROJECTION_ID);
  });
});

describe("project (equal-earth, the default)", () => {
  // Known-good projected coordinates for reference points, from d3's
  // `geoEqualEarth` fit into the 0 0 360 180 box. (0,0) lands dead centre; the
  // equator spans the full width symmetrically about x=180; the poles pull
  // inward (Equal Earth's rounded silhouette).
  it("centres the origin and spans the equator edge-to-edge", () => {
    expect(project(0, 0)).toEqual({ x: 180, y: 90 });
    expect(project(0, 180)).toEqual({ x: 360, y: 90 });
    expect(project(0, -180)).toEqual({ x: 0, y: 90 });
  });

  it("keeps the meridian centred and pulls the poles inward", () => {
    const north = project(90, 0);
    const south = project(-90, 0);
    expect(north.x).toBeCloseTo(180);
    expect(south.x).toBeCloseTo(180);
    expect(north.y).toBeCloseTo(2.390944, 4);
    expect(south.y).toBeCloseTo(177.609056, 4);
    // A pole corner is narrower than the equator's edge: Equal Earth tapers.
    expect(project(90, 180).x).toBeLessThan(project(0, 180).x);
  });

  it("reproduces its known-good coordinates for city reference points", () => {
    const tokyo = project(35.68, 139.69);
    expect(tokyo.x).toBeCloseTo(306.990798, 4);
    expect(tokyo.y).toBeCloseTo(43.602414, 4);
    const sydney = project(-33.87, 151.21);
    expect(sydney.x).toBeCloseTo(318.799378, 4);
    expect(sydney.y).toBeCloseTo(134.20517, 4);
  });
});

describe("equirectangular point projector", () => {
  // The historical closed form, still exact on its own registry entry even
  // though it is no longer the default. (The two deleted inline formulas were
  // `x = lon + 180`, `y = 90 - lat`.)
  const equirect = projectionFor("equirectangular");

  it("reproduces { x: lon + 180, y: 90 - lat } for reference points", () => {
    expect(equirect.point(0, 0)).toEqual({ x: 180, y: 90 });
    expect(equirect.point(90, -180)).toEqual({ x: 0, y: 0 });
    expect(equirect.point(-90, 180)).toEqual({ x: 360, y: 180 });
    expect(equirect.point(35, 139)).toEqual({ x: 319, y: 55 });
  });
});

describe("geoPathString / geoBounds (default projection)", () => {
  // A LineString sidesteps polygon-winding (spherical-interior) semantics, so it
  // tests the projected coordinate space cleanly. Real land/boundary data is
  // correctly wound, so `geoPathString` renders it as a filled shape.
  const diagonal = {
    type: "LineString" as const,
    coordinates: [
      [0, 0],
      [10, 10],
    ],
  };

  it("renders a non-empty SVG path for a GeoJSON geometry", () => {
    const d = geoPathString(diagonal);
    expect(d.length).toBeGreaterThan(0);
    expect(d.startsWith("M")).toBe(true);
  });

  it("bounds a geometry in the same projected space as the default projection", () => {
    const expected = geoPath(projectionFor(DEFAULT_PROJECTION_ID).factory()).bounds(diagonal);
    expect(geoBounds(diagonal)).toEqual(expected);
  });
});

describe("baked land paths", () => {
  // Every offered projection must ship a non-empty baked land silhouette so
  // `MapAid` can look it up by id — regenerate with `generate-world-map`.
  it("bakes a non-empty path for each offered projection", () => {
    for (const p of PROJECTIONS) {
      const d = WORLD_LAND_PATHS[p.id];
      expect(d.length, `missing baked land path for ${p.id}`).toBeGreaterThan(0);
      expect(d.startsWith("M")).toBe(true);
    }
  });
});
