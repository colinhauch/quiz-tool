import { describe, expect, it } from "vitest";
import {
  WORLD_ASPECT,
  WORLD_VIEW,
  easeInOutCubic,
  extentToView,
  fitAspect,
  geometryView,
  interpolateView,
  zoomAtTime,
} from "./mapZoom.js";

const region = extentToView({ minLon: 138.19, minLat: 34.69, maxLon: 141.19, maxLat: 36.69 });

describe("mapZoom", () => {
  // Backward-compat: the world frame is now derived from the active projection's
  // own sphere bounds (`geoBounds({type:"Sphere"})`), not the literal 0,0,360,180.
  // Under the default equirectangular projection it must still be exactly that.
  it("derives the world frame from the projection's sphere bounds (equirect: 0,0,360,180)", () => {
    expect(WORLD_VIEW).toEqual({ x: 0, y: 0, w: 360, h: 180 });
    expect(WORLD_ASPECT).toBe(2);
  });

  it("projects a regional extent to a viewBox (x=minLon+180, y=90-maxLat, w, h)", () => {
    expect(region).toEqual({ x: 318.19, y: 53.31, w: 3, h: 2 });
  });

  it("interpolates global at t=0 and regional at t=1", () => {
    expect(interpolateView(WORLD_VIEW, region, 0)).toEqual(WORLD_VIEW);
    expect(interpolateView(WORLD_VIEW, region, 1)).toEqual(region);
  });

  it("interpolates the midpoint of every viewBox component at t=0.5", () => {
    expect(interpolateView(WORLD_VIEW, region, 0.5)).toEqual({
      x: (0 + 318.19) / 2,
      y: (0 + 53.31) / 2,
      w: (360 + 3) / 2,
      h: (180 + 2) / 2,
    });
  });

  it("eases monotonically from 0 to 1", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    for (let t = 0.1; t <= 1; t += 0.1) {
      expect(easeInOutCubic(t)).toBeGreaterThan(easeInOutCubic(t - 0.1));
    }
  });
});

describe("geometryView", () => {
  // Rings are wound clockwise — d3-geo's spherical convention for an exterior
  // ring — matching the real Natural Earth boundary data. (A counter-clockwise
  // ring is read as the whole sphere minus a hole, framing the entire globe.)
  it("frames a MultiPolygon from its projected bounds (x=minLon+180, y=90-maxLat)", () => {
    const geo = {
      type: "MultiPolygon" as const,
      coordinates: [[[[139, 35], [139, 37], [141, 37], [141, 35], [139, 35]]]],
    };
    expect(geometryView(geo)).toEqual({ x: 319, y: 53, w: 2, h: 2 });
  });

  it("spans every part of a multipart geometry", () => {
    const geo = {
      type: "MultiPolygon" as const,
      coordinates: [
        [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
        [[[10, 10], [10, 11], [11, 11], [11, 10], [10, 10]]],
      ],
    };
    // Union bbox is lon [0,11], lat [0,11].
    expect(geometryView(geo)).toEqual({ x: 180, y: 79, w: 11, h: 11 });
  });
});

describe("fitAspect", () => {
  it("leaves a view already at the target aspect unchanged", () => {
    expect(fitAspect(WORLD_VIEW, WORLD_ASPECT)).toEqual(WORLD_VIEW);
  });

  it("widens a too-tall view around its center, never cropping", () => {
    // Tokyo's 3×2 extent (aspect 1.5) → widened to 4×2 (aspect 2), same center.
    expect(fitAspect(region, WORLD_ASPECT)).toEqual({ x: 317.69, y: 53.31, w: 4, h: 2 });
  });

  it("heightens a too-wide view around its center, never cropping", () => {
    // 8×2 (aspect 4) at the target aspect 2 → 8×4, same center.
    expect(fitAspect({ x: 0, y: 0, w: 8, h: 2 }, 2)).toEqual({ x: 0, y: -1, w: 8, h: 4 });
  });

  it("produces the requested aspect ratio", () => {
    const fitted = fitAspect(region, WORLD_ASPECT);
    expect(fitted.w / fitted.h).toBeCloseTo(WORLD_ASPECT);
  });
});

describe("zoomAtTime (oscillation timeline)", () => {
  const tl = { idleMs: 500, flyMs: 900, holdMs: 3000 };
  const cycle = tl.idleMs + tl.flyMs + tl.holdMs + tl.flyMs; // 5300

  it("stays global through the idle phase", () => {
    expect(zoomAtTime(0, tl)).toBe(0);
    expect(zoomAtTime(499, tl)).toBe(0);
  });

  it("flies in from global to regional over flyMs", () => {
    expect(zoomAtTime(500, tl)).toBe(0); // fly-in just starting
    expect(zoomAtTime(500 + 450, tl)).toBeCloseTo(0.5); // easeInOutCubic(0.5)
    expect(zoomAtTime(500 + 900, tl)).toBe(1); // fully in
  });

  it("holds at regional through the hold phase", () => {
    expect(zoomAtTime(1400, tl)).toBe(1);
    expect(zoomAtTime(1400 + 2999, tl)).toBe(1);
  });

  it("flies back out from regional to global over flyMs", () => {
    const outStart = tl.idleMs + tl.flyMs + tl.holdMs; // 4400
    expect(zoomAtTime(outStart, tl)).toBe(1);
    expect(zoomAtTime(outStart + 450, tl)).toBeCloseTo(0.5);
    expect(zoomAtTime(outStart + 900, tl)).toBeCloseTo(0);
  });

  it("repeats every cycle", () => {
    expect(zoomAtTime(cycle, tl)).toBe(0);
    expect(zoomAtTime(cycle + 500 + 900, tl)).toBe(1);
  });
});
