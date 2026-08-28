import { WORLD_LAND_PATH } from "./world-map.generated.js";

/**
 * Renders one point on an in-house equirectangular world map. No map library at
 * runtime: green land (a baked Natural Earth silhouette — see
 * `scripts/generate-world-map.ts`) over blue ocean inside a `0 0 360 180`
 * viewBox, so plotting a coordinate is `x = (lon + 180) / 360 * W`,
 * `y = (90 - lat) / 180 * H` — the same projection the path was generated with.
 *
 * Kept behind the plain `{lat, lon, label}` interface so the map component is
 * swappable without touching `VisualAid`, the generic slot that owns the
 * `kind` dispatch.
 */
const WIDTH = 360;
const HEIGHT = 180;

function project(lat: number, lon: number) {
  return {
    x: ((lon + 180) / 360) * WIDTH,
    y: ((90 - lat) / 180) * HEIGHT,
  };
}

export function MapAid({ lat, lon, label }: { lat: number; lon: number; label: string }) {
  const { x, y } = project(lat, lon);
  // Keep the label on-canvas: flip its anchor near the right/bottom edges.
  const labelX = x > WIDTH - 60 ? x - 8 : x + 8;
  const labelAnchor = x > WIDTH - 60 ? "end" : "start";
  const labelY = y > HEIGHT - 15 ? y - 8 : y + 14;

  return (
    <svg
      className="map-aid"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`Map showing the location of ${label}`}
    >
      <rect className="map-aid__ocean" x={0} y={0} width={WIDTH} height={HEIGHT} />
      <path className="map-aid__land" d={WORLD_LAND_PATH} />
      <rect
        className="map-aid__frame"
        x={0.5}
        y={0.5}
        width={WIDTH - 1}
        height={HEIGHT - 1}
      />

      <circle className="map-aid__point" cx={x} cy={y} r={3.5} />
      <text className="map-aid__label" x={labelX} y={labelY} textAnchor={labelAnchor}>
        {label}
      </text>
      <text className="map-aid__coords" x={4} y={HEIGHT - 5}>
        {lat.toFixed(2)}, {lon.toFixed(2)}
      </text>
    </svg>
  );
}
