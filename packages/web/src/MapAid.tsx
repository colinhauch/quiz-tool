/**
 * Renders one point on an in-house equirectangular world map. No map library:
 * a graticule inside a `0 0 360 180` viewBox, so plotting a coordinate is
 * `x = (lon + 180) / 360 * W`, `y = (90 - lat) / 180 * H`.
 *
 * Kept behind the plain `{lat, lon, label}` interface so the renderer is
 * swappable without touching `VisualAid`, the generic slot that owns the
 * `renderer` dispatch.
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
      {/* Graticule: equator, prime meridian, and a light degree grid. */}
      <g className="map-aid__grid">
        {[0, 30, 60, 90, 120, 150, 210, 240, 270, 300, 330].map((lonLine) => (
          <line
            key={`v-${lonLine}`}
            x1={(lonLine / 360) * WIDTH}
            y1={0}
            x2={(lonLine / 360) * WIDTH}
            y2={HEIGHT}
          />
        ))}
        {[30, 60, 120, 150].map((latLine) => (
          <line
            key={`h-${latLine}`}
            x1={0}
            y1={(latLine / 180) * HEIGHT}
            x2={WIDTH}
            y2={(latLine / 180) * HEIGHT}
          />
        ))}
      </g>
      <line className="map-aid__equator" x1={0} y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} />
      <line
        className="map-aid__meridian"
        x1={WIDTH / 2}
        y1={0}
        x2={WIDTH / 2}
        y2={HEIGHT}
      />
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
