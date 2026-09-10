import { type GeoPermissibleObjects, type GeoProjection, geoEquirectangular, geoPath } from "d3-geo";

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
 * lat/lon — even though v1 ships a single entry, `equirectangular`. Adding
 * Equal Earth (the spec's real goal) is one more registry entry plus one baked
 * land path; nothing here hard-codes the pair.
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
export type ProjectionId = "equirectangular";

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

export const PROJECTIONS: ProjectionConfig[] = [EQUIRECTANGULAR];

export const DEFAULT_PROJECTION_ID: ProjectionId = "equirectangular";
const DEFAULT_PROJECTION = EQUIRECTANGULAR;

/** Resolve a projection by id, falling back to the default for an unknown id. */
export function projectionFor(id: string): ProjectionConfig {
  return PROJECTIONS.find((p) => p.id === id) ?? DEFAULT_PROJECTION;
}

// v1 has a single, module-level active projection. When the projection becomes a
// per-user preference (#215), this is what the setting selects.
const active = projectionFor(DEFAULT_PROJECTION_ID);
const activePath = geoPath(active.factory());

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
