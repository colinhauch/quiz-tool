import type { VisualAid as VisualAidData } from "@geo/contract";
import { WORLD_LAND_PATH } from "./world-map.generated.js";

/**
 * Renders one point on an in-house equirectangular map. No map library at
 * runtime: green land over blue ocean in a lon/lat coordinate space where
 * `x = lon + 180`, `y = 90 - lat` (the projection the baked 110m world path
 * was generated with — see `scripts/generate-world-map.ts`).
 *
 * Two detail layers, one coordinate space (spec #152, #155): the baked 110m
 * `WORLD_LAND_PATH` is the base; the server-sent `localGeoJSON` — hi-res land
 * clipped for the pinned region — is projected with the *same* point math and
 * composited on top, so the two align by construction. Framed at the regional
 * `regionExtent` (a lon/lat rectangle) when one is present, else the whole
 * world. Static here — no animation or slider yet (#156).
 *
 * Graceful degradation: an entity with a coordinate but no stored clip carries
 * no `regionExtent`/`localGeoJSON`, and the map falls back to full-world framing
 * over the coarse base. (A missing coordinate yields no map at all, upstream.)
 *
 * Kept behind a small props interface — the `map` descriptor's own fields — so
 * the component stays swappable without touching `VisualAid`, the slot that
 * owns the `kind` dispatch.
 */
type MapProps = Pick<
  Extract<VisualAidData, { kind: "map" }>,
  "lat" | "lon" | "label" | "localGeoJSON" | "regionExtent"
>;

const WIDTH = 360;
const HEIGHT = 180;

function project(lat: number, lon: number) {
  return { x: lon + 180, y: 90 - lat };
}

/** A GeoJSON MultiPolygon → an SVG path in the same lon/lat-derived space. */
function geoToPath(geo: NonNullable<MapProps["localGeoJSON"]>): string {
  const parts: string[] = [];
  for (const polygon of geo.coordinates) {
    for (const ring of polygon) {
      ring.forEach((vertex, i) => {
        const { x, y } = project(vertex[1] ?? 0, vertex[0] ?? 0);
        parts.push(`${i === 0 ? "M" : "L"}${x.toFixed(3)},${y.toFixed(3)}`);
      });
      parts.push("Z");
    }
  }
  return parts.join("");
}

export function MapAid({ lat, lon, label, localGeoJSON, regionExtent }: MapProps) {
  // The viewBox is the framing rectangle in projected space. Regional when the
  // server sent an extent; the whole world otherwise.
  const view = regionExtent
    ? {
        x: regionExtent.minLon + 180,
        y: 90 - regionExtent.maxLat,
        w: regionExtent.maxLon - regionExtent.minLon,
        h: regionExtent.maxLat - regionExtent.minLat,
      }
    : { x: 0, y: 0, w: WIDTH, h: HEIGHT };

  // Marks are authored in full-world units; scale them by how zoomed-in the
  // frame is so pin/label/coords stay roughly the same on-screen size at any
  // extent. Strokes use non-scaling-stroke instead (constant pixel width).
  const s = view.w / WIDTH;
  const { x, y } = project(lat, lon);
  const pad = 4 * s;
  // Keep the label on-canvas: flip its anchor near the frame's right/bottom.
  // Margins mirror the original full-world thresholds (60 / 15 units), scaled by
  // `s` so they stay a constant on-screen size — leaving room for the label's
  // pixel width — at any extent.
  const nearRight = x > view.x + view.w - 60 * s;
  const nearBottom = y > view.y + view.h - 15 * s;
  const labelX = nearRight ? x - 8 * s : x + 8 * s;
  const labelAnchor = nearRight ? "end" : "start";
  const labelY = nearBottom ? y - 8 * s : y + 14 * s;

  return (
    <svg
      className="map-aid"
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Map showing the location of ${label}`}
    >
      <rect className="map-aid__ocean" x={view.x} y={view.y} width={view.w} height={view.h} />
      <path className="map-aid__land" d={WORLD_LAND_PATH} vectorEffect="non-scaling-stroke" />
      {localGeoJSON && (
        <path
          className="map-aid__local"
          d={geoToPath(localGeoJSON)}
          vectorEffect="non-scaling-stroke"
        />
      )}
      <rect
        className="map-aid__frame"
        x={view.x}
        y={view.y}
        width={view.w}
        height={view.h}
        vectorEffect="non-scaling-stroke"
      />

      <circle className="map-aid__point" cx={x} cy={y} r={3.5 * s} vectorEffect="non-scaling-stroke" />
      <text
        className="map-aid__label"
        x={labelX}
        y={labelY}
        textAnchor={labelAnchor}
        vectorEffect="non-scaling-stroke"
        style={{ fontSize: `${8 * s}px` }}
      >
        {label}
      </text>
      <text
        className="map-aid__coords"
        x={view.x + pad}
        y={view.y + view.h - pad}
        style={{ fontSize: `${6 * s}px` }}
      >
        {lat.toFixed(2)}, {lon.toFixed(2)}
      </text>
    </svg>
  );
}
