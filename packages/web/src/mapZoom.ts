import type { VisualAid as VisualAidData } from "@geo/contract";

/**
 * The 1-D zoom track for the reveal map (spec #152, #156).
 *
 * Both endpoints are server-fixed: the whole-world frame and the regional
 * extent. Zoom is a single parameter `t` in [0, 1] — 0 is global, 1 is the
 * regional framing — and the viewport is the linear interpolation of the two
 * frames' `viewBox` rectangles. No reprojection, no free panning: the frame
 * only ever slides and scales along the line between those two rectangles, so
 * the learner can never get lost.
 *
 * Pure geometry, kept out of the component so the endpoints and the easing can
 * be tested without rendering or animation frames.
 */
export type View = { x: number; y: number; w: number; h: number };

type RegionExtent = NonNullable<Extract<VisualAidData, { kind: "map" }>["regionExtent"]>;

/** Projected size of the full-world frame (`x = lon + 180`, `y = 90 - lat`). */
export const WORLD_VIEW: View = { x: 0, y: 0, w: 360, h: 180 };

/** The regional extent (a lon/lat rectangle) as a projected `viewBox`. */
export function extentToView(extent: RegionExtent): View {
  return {
    x: extent.minLon + 180,
    y: 90 - extent.maxLat,
    w: extent.maxLon - extent.minLon,
    h: extent.maxLat - extent.minLat,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** The viewport at zoom `t`: `t = 0` → `global`, `t = 1` → `regional`. */
export function interpolateView(global: View, regional: View, t: number): View {
  return {
    x: lerp(global.x, regional.x, t),
    y: lerp(global.y, regional.y, t),
    w: lerp(global.w, regional.w, t),
    h: lerp(global.h, regional.h, t),
  };
}

/** Ease-in-out for the auto-zoom fly. Monotonic, f(0) = 0, f(1) = 1. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
