import { describe, expect, it } from "vitest";
import {
  type View,
  WORLD_ASPECT,
  WORLD_VIEW,
  easeInOutCubic,
  extentToView,
  fitAspect,
  geometryView,
  interpolateView,
  zoomAtTime,
} from "./mapZoom.js";
import { geoBounds, project } from "./projection.js";

/** `geoBounds` result as a `viewBox` rect — the contract `mapZoom`'s framing
 * helpers implement, expressed independently of any one projection's numbers. */
function boundsView(geo: Parameters<typeof geoBounds>[0]): View {
  const [[x0, y0], [x1, y1]] = geoBounds(geo);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const region = extentToView({ minLon: 138.19, minLat: 34.69, maxLon: 141.19, maxLat: 36.69 });

describe("mapZoom", () => {
  // The world frame is derived from the active projection's own sphere bounds
  // (`geoBounds({type:"Sphere"})`), not a literal rectangle — so it tracks
  // whatever projection is the default (Equal Earth, #219).
  it("derives the world frame from the projection's sphere bounds", () => {
    expect(WORLD_VIEW).toEqual(boundsView({ type: "Sphere" }));
    expect(WORLD_ASPECT).toBe(WORLD_VIEW.w / WORLD_VIEW.h);
  });

  it("frames a regional extent to a viewBox that contains its projected corners", () => {
    expect(region.w).toBeGreaterThan(0);
    expect(region.h).toBeGreaterThan(0);
    for (const [lat, lon] of [
      [34.69, 138.19],
      [34.69, 141.19],
      [36.69, 138.19],
      [36.69, 141.19],
    ] as const) {
      const { x, y } = project(lat, lon);
      expect(x).toBeGreaterThanOrEqual(region.x);
      expect(x).toBeLessThanOrEqual(region.x + region.w);
      expect(y).toBeGreaterThanOrEqual(region.y);
      expect(y).toBeLessThanOrEqual(region.y + region.h);
    }
  });

  it("interpolates global at t=0 and regional at t=1", () => {
    expect(interpolateView(WORLD_VIEW, region, 0)).toEqual(WORLD_VIEW);
    expect(interpolateView(WORLD_VIEW, region, 1)).toEqual(region);
  });

  it("interpolates the midpoint of every viewBox component at t=0.5", () => {
    expect(interpolateView(WORLD_VIEW, region, 0.5)).toEqual({
      x: (WORLD_VIEW.x + region.x) / 2,
      y: (WORLD_VIEW.y + region.y) / 2,
      w: (WORLD_VIEW.w + region.w) / 2,
      h: (WORLD_VIEW.h + region.h) / 2,
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
  it("frames a MultiPolygon from its projected bounds", () => {
    const geo = {
      type: "MultiPolygon" as const,
      coordinates: [[[[139, 35], [139, 37], [141, 37], [141, 35], [139, 35]]]],
    };
    expect(geometryView(geo)).toEqual(boundsView(geo));
  });

  it("spans every part of a multipart geometry", () => {
    const geo = {
      type: "MultiPolygon" as const,
      coordinates: [
        [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
        [[[10, 10], [10, 11], [11, 11], [11, 10], [10, 10]]],
      ],
    };
    // Union bbox is lon [0,11], lat [0,11] — geometryView is its projected bounds.
    expect(geometryView(geo)).toEqual(boundsView(geo));
  });
});

describe("fitAspect", () => {
  it("leaves a view already at the target aspect unchanged", () => {
    expect(fitAspect(WORLD_VIEW, WORLD_ASPECT)).toEqual(WORLD_VIEW);
  });

  it("fits a view to the target aspect around its center, never cropping", () => {
    const fitted = fitAspect(region, WORLD_ASPECT);
    // Never crops: each side is at least as large as the original.
    expect(fitted.w).toBeGreaterThanOrEqual(region.w);
    expect(fitted.h).toBeGreaterThanOrEqual(region.h);
    // Same center.
    expect(fitted.x + fitted.w / 2).toBeCloseTo(region.x + region.w / 2);
    expect(fitted.y + fitted.h / 2).toBeCloseTo(region.y + region.h / 2);
    expect(fitted.w / fitted.h).toBeCloseTo(WORLD_ASPECT);
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
