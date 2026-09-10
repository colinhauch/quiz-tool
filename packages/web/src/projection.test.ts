import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROJECTION_ID,
  PROJECTIONS,
  geoBounds,
  geoPathString,
  project,
  projectionFor,
} from "./projection.js";

describe("projection registry", () => {
  it("offers equirectangular as the sole, default entry", () => {
    expect(PROJECTIONS.map((p) => p.id)).toEqual(["equirectangular"]);
    expect(DEFAULT_PROJECTION_ID).toBe("equirectangular");
    expect(PROJECTIONS[0]).toMatchObject({ id: "equirectangular", label: expect.any(String) });
    expect(typeof PROJECTIONS[0]!.factory).toBe("function");
  });

  it("resolves a known id, and falls back to the default for an unknown one", () => {
    expect(projectionFor("equirectangular").id).toBe("equirectangular");
    expect(projectionFor("mystery-mercator").id).toBe(DEFAULT_PROJECTION_ID);
  });
});

describe("project (equirectangular)", () => {
  // The historical mapping the prefactor must preserve bit-for-bit: the two
  // deleted inline formulas were `x = lon + 180`, `y = 90 - lat`.
  it("reproduces { x: lon + 180, y: 90 - lat } for reference points", () => {
    expect(project(0, 0)).toEqual({ x: 180, y: 90 });
    expect(project(90, -180)).toEqual({ x: 0, y: 0 }); // NW corner of the world frame
    expect(project(-90, 180)).toEqual({ x: 360, y: 180 }); // SE corner
    expect(project(35, 139)).toEqual({ x: 319, y: 55 }); // Tokyo-ish
    const sydney = project(-33.87, 151.21); // Sydney-ish
    expect(sydney.x).toBeCloseTo(331.21);
    expect(sydney.y).toBeCloseTo(123.87);
  });
});

describe("geoPathString / geoBounds", () => {
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

  it("bounds a geometry in the same projected space as project()", () => {
    const [[x0, y0], [x1, y1]] = geoBounds(diagonal);
    // lon [0,10] → x [180,190]; lat [0,10] → y [80,90] (y grows southward).
    expect(x0).toBeCloseTo(180);
    expect(x1).toBeCloseTo(190);
    expect(y0).toBeCloseTo(80);
    expect(y1).toBeCloseTo(90);
  });
});
