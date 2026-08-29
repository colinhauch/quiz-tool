import { describe, expect, it } from "vitest";
import { WORLD_VIEW, easeInOutCubic, extentToView, interpolateView } from "./mapZoom.js";

describe("mapZoom", () => {
  const region = extentToView({ minLon: 138.19, minLat: 34.69, maxLon: 141.19, maxLat: 36.69 });

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
