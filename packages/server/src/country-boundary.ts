/**
 * Author-time precompute of a country's boundary outline for the reveal map
 * (spec #203, `sdlc/features/country-boundary-outlines/`): given a country's raw
 * administrative boundary (Natural Earth 10m admin-0) and the framing the reveal
 * map will zoom it to, produce a simplified, island-dropped MultiPolygon small
 * enough to ride inline on the answer response yet crisp at that framing. The
 * result is stored on the entity as `boundaryGeoJSON` beside `localGeoJSON` —
 * never computed per request.
 *
 * The one governing idea (spec "Adaptive simplification"): because auto-zoom
 * frames every country to its own extent, on-screen each roughly fills the same
 * card. So simplification tolerance and the island-drop threshold are measured
 * in **pixels at the country's own framing**, not in degrees or by area. One
 * rule then yields coarse-Canada / fine-Maldives automatically.
 *
 * Pure and total like `regional-geometry.ts`: no IO, no network, no throw. The
 * heavy Natural Earth source is loaded by the import script (Step 3) and the
 * matched feature passed in, which keeps this unit-testable against tiny
 * synthetic polygons.
 */
import { feature } from "topojson-client";
import { topology } from "topojson-server";
import { presimplify, simplify } from "topojson-simplify";
import type { GeoMultiPolygon, RegionExtent } from "@geo/engine";

/**
 * Execution-spike constants, LOCKED 2026-09-07 (spec "Execution-spike constants").
 * `TARGET_PX` is the on-screen simplification tolerance; `DROP_PX` the min ring
 * bbox kept; `CARD_PX` the reveal card's CSS width (26rem, not retina-doubled —
 * SVG is resolution-independent). Downstream (the import script) may raise a
 * single country's effective tolerance to honour the ~40 KB byte-cap valve.
 */
export const TARGET_PX = 0.75;
export const DROP_PX = 1;
export const CARD_PX = 416;

/**
 * Frame aspect (width:height) the framing is grown to match — the reveal map is
 * an equirectangular 360×180 world, so 2:1, and the client fits every zoom to
 * that ratio (`fitAspect` in `packages/web/src/mapZoom.ts`). Mirrored here (not
 * imported) so the server carries no web dependency, as `regional-geometry.ts`
 * mirrors it too.
 */
const FRAME_ASPECT = 2;

/** Fraction of each span added to every side of the raw bbox for framing. */
const PAD_FRAC = 0.08;

/** Output coordinates rounded to this many decimals (~110 m), bounding size. */
const COORD_DECIMALS = 3;
const ROUND_FACTOR = 10 ** COORD_DECIMALS;
const round = (n: number) => Math.round(n * ROUND_FACTOR) / ROUND_FACTOR;

const clampLat = (lat: number) => Math.max(-90, Math.min(90, lat));
const clampLon = (lon: number) => Math.max(-180, Math.min(180, lon));

/** Raw [minLon, minLat, maxLon, maxLat] over every position in the geometry. */
function rawBbox(geo: GeoMultiPolygon): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const polygon of geo.coordinates) {
    for (const ring of polygon) {
      for (const p of ring) {
        const lon = p[0] as number;
        const lat = p[1] as number;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * The lon/lat window the reveal map frames this boundary at: its raw bounding
 * box grown by `PAD_FRAC` of each span on every side, clamped to valid ranges.
 * This is what sets px/deg for simplification (a bigger country → wider framing
 * → coarser tolerance). The client re-derives its own framing at render time
 * (Step 4's `bboxOf`); this one only drives the author-time tolerance.
 */
export function framingBboxOf(geo: GeoMultiPolygon): RegionExtent {
  const [minLon, minLat, maxLon, maxLat] = rawBbox(geo);
  const lonPad = (maxLon - minLon) * PAD_FRAC;
  const latPad = (maxLat - minLat) * PAD_FRAC;
  return {
    minLon: clampLon(minLon - lonPad),
    minLat: clampLat(minLat - latPad),
    maxLon: clampLon(maxLon + lonPad),
    maxLat: clampLat(maxLat + latPad),
  };
}

/**
 * True when the geometry's raw longitude span exceeds 180° — the cheap test for
 * an antimeridian seam-crosser (Russia, Fiji, USA/Aleutians, Kiribati, NZ). v1
 * gives these no boundary; the caller falls back to pin + coastline (spec Q3).
 * The baked world base + coastline layers live in [−180, 180] with no seam
 * unwrapping, so a boundary that spans the seam would frame and draw wrong.
 */
export function isAntimeridianCrossing(geo: GeoMultiPolygon): boolean {
  const [minLon, , maxLon] = rawBbox(geo);
  return maxLon - minLon > 180;
}

/**
 * Aspect-fitted framing width, in degrees — `view.w` after growing the extent to
 * the 2:1 frame (mirrors `fitAspect(...).w`). Drives px/deg = `CARD_PX / view.w`.
 */
function fittedFramingWidth(extent: RegionExtent): number {
  const lonSpan = extent.maxLon - extent.minLon;
  const latSpan = extent.maxLat - extent.minLat;
  return Math.max(lonSpan, latSpan * FRAME_ASPECT);
}

/** Ring bbox width/height in degrees, as [w, h]. */
function ringSpan(ring: number[][]): [number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const p of ring) {
    const lon = p[0] as number;
    const lat = p[1] as number;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [maxLon - minLon, maxLat - minLat];
}

/**
 * Drop every ring whose bbox is under `dropDeg` in *both* dimensions — a
 * sub-pixel speck at this framing (Canada's Arctic dust) — while keeping any
 * ring bigger than that in either dimension (every Maldivian atoll). A polygon
 * whose outer ring is dropped is removed entirely; a dropped hole just vanishes.
 */
function dropSmallRings(geo: GeoMultiPolygon, dropDeg: number): GeoMultiPolygon {
  const coordinates: number[][][][] = [];
  for (const polygon of geo.coordinates) {
    const outer = polygon[0];
    if (!outer) continue;
    const [ow, oh] = ringSpan(outer);
    if (ow < dropDeg && oh < dropDeg) continue; // whole island is sub-pixel
    const rings: number[][][] = [outer];
    for (const hole of polygon.slice(1)) {
      const [hw, hh] = ringSpan(hole);
      if (hw < dropDeg && hh < dropDeg) continue;
      rings.push(hole);
    }
    coordinates.push(rings);
  }
  return { type: "MultiPolygon", coordinates };
}

/**
 * Topology-preserving Visvalingam simplification (spec Q6): points whose
 * effective triangle area falls under `minArea` (deg²) are removed, shared edges
 * kept. Douglas–Peucker was rejected — it nibbles recognizable corners. Uses
 * `topojson-server` to build a topology, `topojson-simplify` to weight
 * (planar triangle area) and filter, then `topojson-client` back to GeoJSON.
 *
 * The weight is a planar triangle area, which may differ from `minArea` by a
 * constant factor (spec Step 0 flags this); the import script (Step 3)
 * calibrates the exact factor against real output and the byte-cap valve.
 */
function visvalingamSimplify(geo: GeoMultiPolygon, minArea: number): GeoMultiPolygon {
  if (geo.coordinates.length === 0 || minArea <= 0) return geo;
  // The three topojson packages' @types don't compose: `presimplify` widens the
  // properties generic to include `null`, which `simplify` then rejects. Round-
  // trip through the untyped seam and assert the MultiPolygon shape once at the
  // end — the input guarantees the geometry stays a MultiPolygon.
  const topo = simplify(presimplify(topology({ boundary: geo }) as never) as never, minArea) as unknown as {
    objects: { boundary: unknown };
  };
  const simplified = feature(topo as never, topo.objects.boundary as never);
  const geometry = (simplified as unknown as { geometry: GeoMultiPolygon }).geometry;
  return { type: "MultiPolygon", coordinates: geometry.coordinates };
}

/**
 * Round every position to `COORD_DECIMALS`, dropping consecutive duplicates the
 * rounding collapses and any ring left with fewer than 4 positions (a closed
 * ring needs ≥4). A polygon whose outer ring collapses is dropped.
 */
function roundGeometry(geo: GeoMultiPolygon): GeoMultiPolygon {
  const roundRing = (ring: number[][]): number[][] | undefined => {
    const out: number[][] = [];
    for (const p of ring) {
      const point = [round(p[0] as number), round(p[1] as number)];
      const last = out[out.length - 1];
      if (!last || last[0] !== point[0] || last[1] !== point[1]) out.push(point);
    }
    return out.length >= 4 ? out : undefined;
  };
  const coordinates: number[][][][] = [];
  for (const polygon of geo.coordinates) {
    const outer = polygon[0];
    if (!outer) continue;
    const roundedOuter = roundRing(outer);
    if (!roundedOuter) continue;
    const rings: number[][][] = [roundedOuter];
    for (const hole of polygon.slice(1)) {
      const roundedHole = roundRing(hole);
      if (roundedHole) rings.push(roundedHole);
    }
    coordinates.push(rings);
  }
  return { type: "MultiPolygon", coordinates };
}

/** Tuning knobs, defaulting to the locked spike constants. */
export interface SimplifyOptions {
  targetPx?: number;
  dropPx?: number;
  cardPx?: number;
}

/**
 * The whole boundary precompute for one country: given its raw boundary and the
 * framing extent it will be zoomed to, drop sub-pixel islands, Visvalingam-
 * simplify to the framing's pixel tolerance, and round. Returns exactly what
 * gets stored as `boundaryGeoJSON`.
 *
 * Tolerance and drop scale with the framing width: `deg-per-px = view.w /
 * CARD_PX`, so `toleranceDeg = TARGET_PX × view.w / CARD_PX` and the Visvalingam
 * min-area is `toleranceDeg²`. A wide framing (big country) gets a coarse
 * outline, a narrow one (small country) a fine outline — from a single rule.
 */
export function simplifyForFraming(
  geo: GeoMultiPolygon,
  extent: RegionExtent,
  { targetPx = TARGET_PX, dropPx = DROP_PX, cardPx = CARD_PX }: SimplifyOptions = {},
): GeoMultiPolygon {
  const viewW = fittedFramingWidth(extent);
  const degPerPx = viewW / cardPx;
  const toleranceDeg = targetPx * degPerPx;
  const dropDeg = dropPx * degPerPx;
  const minArea = toleranceDeg * toleranceDeg;
  const dropped = dropSmallRings(geo, dropDeg);
  const simplified = visvalingamSimplify(dropped, minArea);
  return roundGeometry(simplified);
}
