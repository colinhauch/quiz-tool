import type { VisualAid as VisualAidData } from "@geo/contract";
import { useEffect, useRef, useState } from "react";
import { WORLD_LAND_PATH } from "./world-map.generated.js";
import { WORLD_VIEW, easeInOutCubic, extentToView, interpolateView } from "./mapZoom.js";

/**
 * The reveal map: one animated equirectangular viewport that shows both the
 * global and the regional scale over time in a single box (spec #152, #156).
 *
 * Two detail layers, one coordinate space (#155): the baked 110m
 * `WORLD_LAND_PATH` is the base; the server-sent `localGeoJSON` — hi-res land
 * clipped for the pinned region — is projected with the *same* point math
 * (`x = lon + 180`, `y = 90 - lat`) and composited on top, so the two align by
 * construction.
 *
 * Zoom is a 1-D track (see `mapZoom`): the `viewBox` is the linear interpolation
 * between the whole-world frame (`t = 0`) and the regional `regionExtent`
 * (`t = 1`). A slider gives the learner manual global⟷regional control, always
 * aimed at the same server-fixed target — no free panning, you cannot get lost.
 *
 * Auto-zoom (`autoZoom`, a persisted learner toggle): the map appears global,
 * waits `idleDelayMs`, then flies to the regional framing over `flyDurationMs`.
 * Any manual slider input cancels an in-progress fly and hands over control.
 * `prefers-reduced-motion` suppresses the fly entirely — the map snaps straight
 * to the regional framing, and the slider stays available.
 *
 * Graceful degradation: an entity with a coordinate but no stored clip carries
 * no `regionExtent`/`localGeoJSON`. There is then nothing to zoom toward, so the
 * map stays at full-world framing over the coarse base and shows no slider. (A
 * missing coordinate yields no map at all, upstream.)
 *
 * Kept behind a small props interface — the `map` descriptor's own fields plus
 * the `autoZoom` preference — so the component stays swappable without touching
 * `VisualAid`, the slot that owns the `kind` dispatch. Timing/easing are tuned
 * by feel, so they are adjustable (module defaults, overridable per instance)
 * rather than hard-coded to one behavior.
 */
type MapProps = Pick<
  Extract<VisualAidData, { kind: "map" }>,
  "lat" | "lon" | "label" | "localGeoJSON" | "regionExtent"
> & {
  /** Whether the map auto-flies to the regional framing. Default off. */
  autoZoom?: boolean;
  /** Pause at global scale before the fly begins. Tunable. */
  idleDelayMs?: number;
  /** Duration of the global→regional fly. Tunable. */
  flyDurationMs?: number;
};

const WIDTH = WORLD_VIEW.w;
const IDLE_DELAY_MS = 900;
const FLY_DURATION_MS = 1100;

function project(lat: number, lon: number) {
  return { x: lon + 180, y: 90 - lat };
}

/** Guarded — jsdom and old browsers lack `matchMedia`; then assume motion is ok. */
function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
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

export function MapAid({
  lat,
  lon,
  label,
  localGeoJSON,
  regionExtent,
  autoZoom = false,
  idleDelayMs = IDLE_DELAY_MS,
  flyDurationMs = FLY_DURATION_MS,
}: MapProps) {
  const regionView = regionExtent ? extentToView(regionExtent) : null;
  const canZoom = regionView !== null;

  // Zoom position on the 1-D track: 0 = global, 1 = regional. With reduced
  // motion we skip the fly by snapping to the destination; otherwise we start
  // global (and, if auto-zoom is on, animate there — see the effect below).
  const [t, setT] = useState(() =>
    canZoom && autoZoom && prefersReducedMotion() ? 1 : 0,
  );

  // Once the learner grabs the slider we never auto-fly again for this reveal.
  const manualRef = useRef(false);

  useEffect(() => {
    if (!canZoom || !autoZoom || manualRef.current || prefersReducedMotion()) {
      return;
    }

    let frame = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (manualRef.current) return;
      if (start === null) start = now;
      const progress = Math.min((now - start) / flyDurationMs, 1);
      setT(easeInOutCubic(progress));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    const timer = setTimeout(() => {
      if (!manualRef.current) frame = requestAnimationFrame(step);
    }, idleDelayMs);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
    // Re-arm only when the target (the pinned point) or the tuning changes — not
    // on every animation frame. Keyed on the primitive coordinate rather than
    // the `regionExtent` object so a fresh-but-equal payload can't restart the fly.
  }, [canZoom, autoZoom, idleDelayMs, flyDurationMs, lat, lon]);

  function onScrub(next: number) {
    manualRef.current = true; // cancels the fly (the rAF loop bails on this)
    setT(next);
  }

  // The viewBox is the framing rectangle in projected space, interpolated along
  // the track. Without a regional target it is simply the whole world.
  const view = regionView ? interpolateView(WORLD_VIEW, regionView, t) : WORLD_VIEW;

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
    <div className="map-aid-viewport">
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

      {canZoom && (
        <input
          className="map-aid__zoom"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={t}
          onChange={(e) => onScrub(Number(e.target.value))}
          aria-label={`Zoom the map from the whole world in to ${label}`}
        />
      )}
    </div>
  );
}
