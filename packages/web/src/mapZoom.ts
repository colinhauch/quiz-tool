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
type GeoMultiPolygon = NonNullable<Extract<VisualAidData, { kind: "map" }>["boundaryGeoJSON"]>;

/** Projected size of the full-world frame (`x = lon + 180`, `y = 90 - lat`). */
export const WORLD_VIEW: View = { x: 0, y: 0, w: 360, h: 180 };

/** The frame's width-to-height ratio, held constant across the whole zoom. */
export const WORLD_ASPECT = WORLD_VIEW.w / WORLD_VIEW.h;

/**
 * Grow a view (around its center, never cropping) until it matches `aspect`.
 *
 * The regional extent's own aspect rarely matches the viewport's, and a viewBox
 * whose aspect changes as it zooms makes the rendered SVG reflow its height —
 * which shoves the content below it around. Fitting both zoom endpoints to one
 * aspect keeps the frame a constant shape (and constant on-screen height) from
 * global all the way in.
 */
export function fitAspect(view: View, aspect: number): View {
  const w = Math.max(view.w, view.h * aspect);
  const h = Math.max(view.h, view.w / aspect);
  const cx = view.x + view.w / 2;
  const cy = view.y + view.h / 2;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** The regional extent (a lon/lat rectangle) as a projected `viewBox`. */
export function extentToView(extent: RegionExtent): View {
  return {
    x: extent.minLon + 180,
    y: 90 - extent.maxLat,
    w: extent.maxLon - extent.minLon,
    h: extent.maxLat - extent.minLat,
  };
}

/**
 * A MultiPolygon's lon/lat bounding box as a projected `viewBox` (spec #203,
 * Q5). Used to frame the reveal map to a country's real outline instead of the
 * coarse type-based `regionExtent`: the client derives the zoom target from the
 * boundary geometry it was already sent, so nothing new is persisted. Raw bbox,
 * no padding — the caller pads and `fitAspect`s it into the final frame.
 */
export function bboxOf(geo: GeoMultiPolygon): View {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const polygon of geo.coordinates) {
    for (const ring of polygon) {
      for (const vertex of ring) {
        const lon = vertex[0] ?? 0;
        const lat = vertex[1] ?? 0;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return { x: minLon + 180, y: 90 - maxLat, w: maxLon - minLon, h: maxLat - minLat };
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

/** One auto-zoom oscillation cycle, in milliseconds. All phases tunable. */
export type ZoomTimeline = { idleMs: number; flyMs: number; holdMs: number };

/**
 * The auto-zoom position at `elapsedMs` — a repeating global→regional→global
 * oscillation (spec #152, #156, revised by feel): hold global for `idleMs`,
 * ease in over `flyMs`, hold regional for `holdMs`, ease back out over `flyMs`,
 * then loop. Pure function of elapsed time so the timeline is testable without
 * running frames; the component just feeds it `now - start` each frame.
 */
export function zoomAtTime(elapsedMs: number, { idleMs, flyMs, holdMs }: ZoomTimeline): number {
  const cycle = idleMs + flyMs + holdMs + flyMs;
  const p = ((elapsedMs % cycle) + cycle) % cycle; // wrap, guarding negatives
  if (p < idleMs) return 0;
  if (p < idleMs + flyMs) return easeInOutCubic((p - idleMs) / flyMs);
  if (p < idleMs + flyMs + holdMs) return 1;
  return 1 - easeInOutCubic((p - idleMs - flyMs - holdMs) / flyMs);
}
