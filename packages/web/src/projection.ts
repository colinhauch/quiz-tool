import {
  type GeoPermissibleObjects,
  type GeoProjection,
  geoEqualEarth,
  geoEquirectangular,
  geoPath,
} from "d3-geo";

/**
 * The one place lat/lon becomes screen coordinates (spec #215, prefactor #217).
 *
 * Every map surface — `MapAid`'s pins, its `localGeoJSON`/`boundaryGeoJSON`
 * overlays, the baked world-land path, and `mapZoom`'s framing — shares this
 * module, so the four layers land in one coordinate space by construction. The
 * two inline formulas this replaces (`x = lon + 180`, `y = 90 - lat`, once in
 * `MapAid` and again in `mapZoom`) are gone.
 *
 * A projection is looked up by a stable string id from `PROJECTIONS`, each entry
 * `{ id, label, factory }` where `factory` returns a d3 `GeoProjection`. The
 * layer is general — any d3 projection works because all geometry is stored as
 * lat/lon. The registry ships two entries: `equal-earth` (the default every
 * learner now sees) and `equirectangular` (the historical mapping, kept for its
 * exact closed form and as a second option). Each projection also owns a baked
 * land path (`scripts/generate-world-map.ts` emits one per entry); `MapAid`
 * looks the path up by the active projection id, so nothing hard-codes the pair.
 *
 * Two shaped outputs, one mapping:
 *   - `project(lat, lon)` — the scalar point projector the pins and `mapZoom`
 *     use. For `equirectangular` this is the exact closed form, so the historical
 *     integer/decimal coordinates are reproduced bit-for-bit (the refactor is a
 *     pure prefactor; the existing frame tests still assert `toEqual`).
 *   - `geoPathString` / `geoBounds` — d3 `geoPath` over the same projection, for
 *     turning GeoJSON into an SVG path (and, later, framing geometry). These
 *     carry d3's own floating-point noise, which is invisible in rendered paths
 *     and never asserted numerically.
 * Both are driven by the same projection config, so they describe one mapping.
 */
export type ProjectionId = "equal-earth" | "equirectangular";

/** A scalar point projector: stored (lat, lon) → projected (x, y). */
type PointProjector = (lat: number, lon: number) => { x: number; y: number };

export type ProjectionConfig = {
  id: ProjectionId;
  label: string;
  /** A d3 `GeoProjection`, used for `geoPath`/bounds over GeoJSON geometry. */
  factory: () => GeoProjection;
  /** The exact scalar mapping for points, kept free of d3's radian round-trip. */
  point: PointProjector;
};

/**
 * Equirectangular (plate carrée) configured so lon [-180, 180] → x [0, 360] and
 * lat [90, -90] → y [0, 180] — the historical `{ x: lon + 180, y: 90 - lat }`
 * mapping the baked land path (`scripts/generate-world-map.ts`) shares. `scale
 * 180/π` + `translate([180, 90])` makes one radian of longitude one degree of x.
 */
const equirectangularFactory = (): GeoProjection =>
  geoEquirectangular()
    .scale(180 / Math.PI)
    .translate([180, 90]);

const EQUIRECTANGULAR: ProjectionConfig = {
  id: "equirectangular",
  label: "Equirectangular",
  factory: equirectangularFactory,
  point: (lat, lon) => ({ x: lon + 180, y: 90 - lat }),
};

/**
 * Equal Earth (Šavrič–Patterson–Jenny, 2018) — an equal-area world projection —
 * fit into the same `0 0 360 180` box the equirectangular entry uses, so both
 * projections plot into a comparably sized viewport and the marker/label sizing
 * (authored in full-world units) stays sensible. `fitExtent` solves scale +
 * translate so the whole sphere fills the box's width; the equator lands on the
 * centre line (lat 0 → y 90) and the poles pull inward, giving Equal Earth its
 * rounded silhouette. Unlike equirectangular there is no clean closed form, so
 * the `point` projector defers to d3's own `GeoProjection` (a single cached
 * instance — the `fitExtent` solve is not free to redo per point).
 */
const equalEarthFactory = (): GeoProjection =>
  geoEqualEarth().fitExtent(
    [
      [0, 0],
      [360, 180],
    ],
    { type: "Sphere" },
  );

const equalEarthProjection = equalEarthFactory();

const EQUAL_EARTH: ProjectionConfig = {
  id: "equal-earth",
  label: "Equal Earth",
  factory: equalEarthFactory,
  point: (lat, lon) => {
    const p = equalEarthProjection([lon, lat]) ?? [Number.NaN, Number.NaN];
    return { x: p[0], y: p[1] };
  },
};

export const PROJECTIONS: ProjectionConfig[] = [EQUAL_EARTH, EQUIRECTANGULAR];

export const DEFAULT_PROJECTION_ID: ProjectionId = "equal-earth";
const DEFAULT_PROJECTION = EQUAL_EARTH;

/** Resolve a projection by id, falling back to the default for an unknown id. */
export function projectionFor(id: string): ProjectionConfig {
  return PROJECTIONS.find((p) => p.id === id) ?? DEFAULT_PROJECTION;
}

// v1 has a single, module-level active projection. When the projection becomes a
// per-user preference (#215), this is what the setting selects.
const active = projectionFor(DEFAULT_PROJECTION_ID);
const activePath = geoPath(active.factory());

/** The id of the active projection — how `MapAid` picks the matching baked land
 * path from `world-map.generated`. Tracks `active`, so it flips with the default. */
export const ACTIVE_PROJECTION_ID: ProjectionId = active.id;

/** Project a stored (lat, lon) to the active projection's (x, y) screen space. */
export function project(lat: number, lon: number): { x: number; y: number } {
  return active.point(lat, lon);
}

/** A GeoJSON geometry as an SVG path string in the active projection's space. */
export function geoPathString(geo: GeoPermissibleObjects): string {
  return activePath(geo) ?? "";
}

/** Projected bounds `[[x0, y0], [x1, y1]]` of a GeoJSON geometry. */
export function geoBounds(geo: GeoPermissibleObjects): [[number, number], [number, number]] {
  return activePath.bounds(geo);
}
