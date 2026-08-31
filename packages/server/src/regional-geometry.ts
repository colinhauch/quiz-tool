/**
 * Author-time precompute of an entity's regional map geometry (spec #152,
 * ticket #154): given a coordinate + the entity's types, choose a lon/lat
 * window sized by type and clip Natural Earth land to it. The result — raw
 * lon/lat `localGeoJSON` plus the `regionExtent` it was clipped to — is stored
 * on the entity beside its P625 `coordinate`, so answering a question just
 * reads it (no per-request clipping).
 *
 * Pure and total, like `wikidata-coordinate.ts`: no IO, no network, no throw.
 * The heavy Natural Earth source is loaded by the import script and passed in,
 * which keeps this unit-testable against tiny synthetic land.
 */
import type { GeoMultiPolygon, RegionExtent } from "@geo/engine";

/**
 * Half-width of the regional window, in degrees, per entity type. Centered on
 * the pin, so the full window is twice this. City ≈ a few hundred km (2.5° lat
 * ≈ 280 km), country ≈ a rough national frame, continent ≈ a wide gentle view.
 * Deliberately coarse round numbers — the exact framing is a client-feel knob
 * (spec defers motion/framing tuning), so this stays easy to adjust.
 */
const HALF_SPAN_DEG: Record<string, number> = {
  city: 2.5,
  country: 10,
  continent: 35,
};

/** Fallback for an entity whose type declares no span (kept country-ish). */
const DEFAULT_HALF_SPAN_DEG = 10;

/**
 * Frame aspect (width:height) the clip window is grown to match. The reveal map
 * is an equirectangular world — a 360×180 projected box, so 2:1 — and the client
 * frames every zoom at that ratio. Clipping to the *same* ratio (lon half-span =
 * `FRAME_ASPECT` × lat half-span) makes the stored region fill the frame instead
 * of sitting as a narrower box inside it (spec #152). Kept here, not imported
 * from the web package, so the server carries no web dependency.
 */
const FRAME_ASPECT = 2;

/**
 * Output coordinates are rounded to this many decimals (~110 m at 3) to bound
 * stored size — far finer than 50m coastlines resolve, so invisible on the card.
 */
const COORD_DECIMALS = 3;

/** Widest span among an entity's types wins; unknown types fall back. */
function halfSpanFor(types: string[]): number {
  const spans = types.map((t) => HALF_SPAN_DEG[t] ?? DEFAULT_HALF_SPAN_DEG);
  return spans.length > 0 ? Math.max(...spans) : DEFAULT_HALF_SPAN_DEG;
}

const clampLat = (lat: number) => Math.max(-90, Math.min(90, lat));
const clampLon = (lon: number) => Math.max(-180, Math.min(180, lon));

/**
 * The lon/lat window to clip to: centered on `coordinate`, half-width chosen by
 * type, clamped to valid ranges (so a pin near a pole or the antimeridian still
 * yields an in-range rectangle).
 */
export function regionExtentFor(coordinate: { lat: number; lon: number }, types: string[]): RegionExtent {
  const half = halfSpanFor(types); // vertical (lat) half-span
  const lonHalf = half * FRAME_ASPECT; // widen so the window matches the 2:1 frame
  return {
    minLon: clampLon(coordinate.lon - lonHalf),
    minLat: clampLat(coordinate.lat - half),
    maxLon: clampLon(coordinate.lon + lonHalf),
    maxLat: clampLat(coordinate.lat + half),
  };
}

// --- Sutherland–Hodgman clip of a polygon ring against an axis-aligned box ---

type Vertex = [number, number];
type Edge = { inside: (v: Vertex) => boolean; intersect: (a: Vertex, b: Vertex) => Vertex };

/** The four half-planes of the extent, as inside-tests + edge intersections. */
function edgesOf(extent: RegionExtent): Edge[] {
  const lerp = (a: number, b: number, t: number) => a + t * (b - a);
  return [
    // left: lon >= minLon
    {
      inside: ([lon]) => lon >= extent.minLon,
      intersect: (a, b) => {
        const t = (extent.minLon - a[0]) / (b[0] - a[0]);
        return [extent.minLon, lerp(a[1], b[1], t)];
      },
    },
    // right: lon <= maxLon
    {
      inside: ([lon]) => lon <= extent.maxLon,
      intersect: (a, b) => {
        const t = (extent.maxLon - a[0]) / (b[0] - a[0]);
        return [extent.maxLon, lerp(a[1], b[1], t)];
      },
    },
    // bottom: lat >= minLat
    {
      inside: ([, lat]) => lat >= extent.minLat,
      intersect: (a, b) => {
        const t = (extent.minLat - a[1]) / (b[1] - a[1]);
        return [lerp(a[0], b[0], t), extent.minLat];
      },
    },
    // top: lat <= maxLat
    {
      inside: ([, lat]) => lat <= extent.maxLat,
      intersect: (a, b) => {
        const t = (extent.maxLat - a[1]) / (b[1] - a[1]);
        return [lerp(a[0], b[0], t), extent.maxLat];
      },
    },
  ];
}

/** Clip one open vertex list (no repeated closing vertex) against one edge. */
function clipAgainstEdge(vertices: Vertex[], edge: Edge): Vertex[] {
  const out: Vertex[] = [];
  for (let i = 0; i < vertices.length; i++) {
    const current = vertices[i] as Vertex;
    const prev = vertices[(i + vertices.length - 1) % vertices.length] as Vertex;
    const currentIn = edge.inside(current);
    const prevIn = edge.inside(prev);
    if (currentIn) {
      if (!prevIn) out.push(edge.intersect(prev, current));
      out.push(current);
    } else if (prevIn) {
      out.push(edge.intersect(prev, current));
    }
  }
  return out;
}

const ROUND_FACTOR = 10 ** COORD_DECIMALS;
const round = (n: number) => Math.round(n * ROUND_FACTOR) / ROUND_FACTOR;

/**
 * Clip a closed GeoJSON ring to the extent. Returns a closed ring (first vertex
 * repeated at the end) rounded to `COORD_DECIMALS`, or `undefined` if nothing of
 * the ring survives.
 */
function clipRing(ring: number[][], edges: Edge[]): number[][] | undefined {
  // Drop the repeated closing vertex; Sutherland–Hodgman treats the list as
  // implicitly closed. GeoJSON positions are always [lon, lat].
  let vertices: Vertex[] = ring.slice(0, -1).map((p): Vertex => [p[0] as number, p[1] as number]);
  for (const edge of edges) {
    vertices = clipAgainstEdge(vertices, edge);
    if (vertices.length === 0) return undefined;
  }
  if (vertices.length < 3) return undefined;
  // Round, then drop consecutive duplicates the rounding may have collapsed.
  const rounded: Vertex[] = [];
  for (const [lon, lat] of vertices) {
    const point: Vertex = [round(lon), round(lat)];
    const last = rounded[rounded.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) rounded.push(point);
  }
  if (rounded.length < 3) return undefined;
  const first = rounded[0] as Vertex;
  rounded.push([first[0], first[1]]); // re-close
  return rounded;
}

/** Bounding box of a ring, as [minLon, minLat, maxLon, maxLat]. */
function ringBbox(ring: number[][]): [number, number, number, number] {
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
  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Clip a MultiPolygon to `extent`, keeping only the land inside the window.
 * Each polygon is quick-rejected by its outer-ring bbox; surviving polygons
 * have their outer ring and holes clipped independently. A polygon whose outer
 * ring clips away is dropped entirely.
 */
export function clipToExtent(land: GeoMultiPolygon, extent: RegionExtent): GeoMultiPolygon {
  const edges = edgesOf(extent);
  const coordinates: number[][][][] = [];

  for (const polygon of land.coordinates) {
    const outer = polygon[0];
    if (!outer) continue;
    const [minLon, minLat, maxLon, maxLat] = ringBbox(outer);
    // Quick reject: outer-ring bbox disjoint from the window.
    if (maxLon < extent.minLon || minLon > extent.maxLon || maxLat < extent.minLat || minLat > extent.maxLat) {
      continue;
    }
    const clippedOuter = clipRing(outer, edges);
    if (!clippedOuter) continue;
    const rings: number[][][] = [clippedOuter];
    for (const hole of polygon.slice(1)) {
      const clippedHole = clipRing(hole, edges);
      if (clippedHole) rings.push(clippedHole);
    }
    coordinates.push(rings);
  }

  return { type: "MultiPolygon", coordinates };
}

/**
 * The whole precompute for one entity: pick the window from its coordinate +
 * types, clip `land` to it. Returns exactly what gets stored on the entity.
 */
export function regionalGeometryFor(
  coordinate: { lat: number; lon: number },
  types: string[],
  land: GeoMultiPolygon,
): { localGeoJSON: GeoMultiPolygon; regionExtent: RegionExtent } {
  const regionExtent = regionExtentFor(coordinate, types);
  return { localGeoJSON: clipToExtent(land, regionExtent), regionExtent };
}
