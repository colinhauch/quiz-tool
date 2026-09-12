import type { VisualAid as VisualAidData } from "@geo/contract";
import { DEFAULT_PROJECTOR, type Projector } from "./projection.js";

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

/** A projected bounds pair `[[x0, y0], [x1, y1]]` (as `geoBounds` returns) as a
 * `viewBox` rectangle. */
function viewFromBounds([[x0, y0], [x1, y1]]: [[number, number], [number, number]]): View {
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * The full-world frame for a projection, from the *projected* bounds of the whole
 * sphere (`projector.geoBounds({ type: "Sphere" })`) — not a hard-coded
 * rectangle, and not the projected NW/SE corners (which only bound the sphere for
 * a rectangular projection; under, say, Equal Earth the widest point is the
 * equator, not the pole line). Every framing helper here takes the projection as
 * a `Projector` so `MapAid` can switch projection live (#220); the module-level
 * `WORLD_VIEW`/`extentToView`/`geometryView` below are the same helpers bound to
 * the default projector — the default-projection frame the projection tests
 * pin, with no production caller now that `MapAid` threads its own projector.
 */
export function worldViewFor(projector: Projector): View {
  return viewFromBounds(projector.geoBounds({ type: "Sphere" }));
}

/** The default projection's full-world frame. */
export const WORLD_VIEW: View = worldViewFor(DEFAULT_PROJECTOR);

/** The default frame's width-to-height ratio, held constant across the whole zoom. */
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

/** Bounding `viewBox` of a set of already-projected points. */
function boundsOfPoints(points: { x: number; y: number }[]): View {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const { x, y } of points) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Samples per edge when framing an extent-only region (below). */
const EXTENT_SAMPLES = 16;

/**
 * The fallback zoom target for a point/extent-only entity (no boundary polygon):
 * the projected box around a lon/lat rectangle. We can't just project the two
 * corners — under a non-rectangular projection a lon/lat box maps to a *curved*
 * quad whose extremes lie along the edges, not at the corners — so we sample
 * along all four edges and bound the projected samples. For equirectangular the
 * mapping is linear, so the extrema are the corners and this reproduces the
 * historical `{ x: minLon+180, y: 90-maxLat, w, h }` exactly.
 */
export function extentToViewFor(projector: Projector, extent: RegionExtent): View {
  const { minLon, minLat, maxLon, maxLat } = extent;
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i <= EXTENT_SAMPLES; i++) {
    const f = i / EXTENT_SAMPLES;
    const lon = minLon + f * (maxLon - minLon);
    const lat = minLat + f * (maxLat - minLat);
    points.push(projector.project(maxLat, lon)); // top edge
    points.push(projector.project(minLat, lon)); // bottom edge
    points.push(projector.project(lat, minLon)); // left edge
    points.push(projector.project(lat, maxLon)); // right edge
  }
  return boundsOfPoints(points);
}

/** {@link extentToViewFor} bound to the default projection. */
export function extentToView(extent: RegionExtent): View {
  return extentToViewFor(DEFAULT_PROJECTOR, extent);
}

/**
 * A region polygon's projected bounds as a `viewBox` (spec #203, Q5), via
 * `geoBounds` over the active projection — the geometry's *actual* projected
 * extent (a lon/lat box projects to a curved quad, so its bounds differ from the
 * naively projected corner bbox under any non-rectangular projection). Used to
 * frame the reveal map to a country's real outline instead of the coarse
 * type-based `regionExtent`: the client derives the zoom target from the
 * boundary geometry it was already sent, so nothing new is persisted. Rings must
 * be wound clockwise (d3-geo's exterior-ring convention, which the stored
 * Natural Earth boundaries follow). Raw bounds, no padding — the caller pads and
 * `fitAspect`s it into the final frame.
 */
export function geometryViewFor(projector: Projector, geo: GeoMultiPolygon): View {
  return viewFromBounds(projector.geoBounds(geo));
}

/** {@link geometryViewFor} bound to the default projection. */
export function geometryView(geo: GeoMultiPolygon): View {
  return geometryViewFor(DEFAULT_PROJECTOR, geo);
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
