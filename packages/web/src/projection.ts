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

/**
 * A projection bound to its coordinate helpers — the runtime handle a map
 * surface holds. Where the module-level `project`/`geoPathString`/`geoBounds`
 * are fixed to the default projection, a `Projector` carries the *chosen* one,
 * so `MapAid` can re-render live when the learner switches projection (#220)
 * without any module-level mutable state. Its `geoPath` is built once per
 * projector (the `fitExtent`/`geoPath` solve isn't free), so callers memoize the
 * projector by id rather than rebuilding it per render.
 */
export type Projector = {
  id: ProjectionId;
  label: string;
  /** Project a stored (lat, lon) to this projection's (x, y) screen space. */
  project: PointProjector;
  /** A GeoJSON geometry as an SVG path string in this projection's space. */
  geoPathString: (geo: GeoPermissibleObjects) => string;
  /** Projected bounds `[[x0, y0], [x1, y1]]` of a GeoJSON geometry. */
  geoBounds: (geo: GeoPermissibleObjects) => [[number, number], [number, number]];
};

/** Build the projector for `id` (falling back to the default for an unknown id). */
export function makeProjector(id: string): Projector {
  const config = projectionFor(id);
  const path = geoPath(config.factory());
  return {
    id: config.id,
    label: config.label,
    project: config.point,
    geoPathString: (geo) => path(geo) ?? "",
    geoBounds: (geo) => path.bounds(geo),
  };
}

// The module-level default projector — every map surface starts here, and the
// bare `project`/`geoPathString`/`geoBounds` exports below (kept for `mapZoom`'s
// default frame and the projection tests) are its bound helpers.
export const DEFAULT_PROJECTOR: Projector = makeProjector(DEFAULT_PROJECTION_ID);

/** Project a stored (lat, lon) to the default projection's (x, y) screen space. */
export const project = DEFAULT_PROJECTOR.project;

/** A GeoJSON geometry as an SVG path string in the default projection's space. */
export const geoPathString = DEFAULT_PROJECTOR.geoPathString;

/** Projected bounds `[[x0, y0], [x1, y1]]` of a GeoJSON geometry (default projection). */
export const geoBounds = DEFAULT_PROJECTOR.geoBounds;
