import type { VisualAid as VisualAidData } from "@geo/contract";
import { useEffect, useRef, useState } from "react";
import { WORLD_LAND_PATH } from "./world-map.generated.js";
import {
  WORLD_ASPECT,
  WORLD_VIEW,
  extentToView,
  fitAspect,
  interpolateView,
  zoomAtTime,
} from "./mapZoom.js";

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
 * between the whole-world frame (`t = 0`) and the regional target (`t = 1`). The
 * target is the `regionExtent` fitted to the world's aspect ratio, so the frame
 * keeps a constant shape — and therefore a constant on-screen height — from
 * global all the way in (no reflow shoving the content below it). A slider gives
 * the learner manual global⟷regional control, always aimed at that same
 * server-fixed target — no free panning, you cannot get lost.
 *
 * Auto-zoom (`autoZoom`, a persisted learner toggle): the map gently oscillates
 * — hold global (`idleMs`), ease in (`flyMs`), hold regional (`holdMs`), ease
 * back out, repeat (see `zoomAtTime`). Any manual slider input cancels the
 * oscillation and hands over control. `prefers-reduced-motion` suppresses all
 * motion — the map snaps straight to the regional framing, slider still available.
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
 *
 * Permanent mode (#186): `lat`/`lon` are optional. With no coordinates —
 * the media panel's map slot before the answer is known — this renders the
 * bare zoomed-out world (no pin/label/coords/slider). The zoom-slider row is
 * always present in the layout (empty when there's nothing to zoom toward)
 * so that state and the answered state are the same height; no reflow when
 * the slider appears.
 */
type MapProps = Omit<
  Pick<
    Extract<VisualAidData, { kind: "map" }>,
    "lat" | "lon" | "label" | "localGeoJSON" | "regionExtent"
  >,
  "lat" | "lon" | "label"
> & {
  lat?: number;
  lon?: number;
  label?: string;
  /** Whether the map auto-zooms (oscillates global⟷regional). Default off. */
  autoZoom?: boolean;
  /** Pause at global scale before easing in. Tunable. */
  idleMs?: number;
  /** Duration of each ease in / ease out. Tunable. */
  flyMs?: number;
  /** Pause at the regional framing before easing back out. Tunable. */
  holdMs?: number;
};

const WIDTH = WORLD_VIEW.w;
const IDLE_MS = 500;
const FLY_MS = 900;
const HOLD_MS = 3000;

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
  idleMs = IDLE_MS,
  flyMs = FLY_MS,
  holdMs = HOLD_MS,
}: MapProps) {
  const hasCoords = lat !== undefined && lon !== undefined;

  // The zoom target: the regional extent grown to the world's aspect ratio, so
  // the frame's shape (and on-screen height) never changes as it zooms. There
  // is nothing to zoom toward without a pinned coordinate.
  const regionView = hasCoords && regionExtent
    ? fitAspect(extentToView(regionExtent), WORLD_ASPECT)
    : null;
  const canZoom = regionView !== null;

  // Zoom position on the 1-D track: 0 = global, 1 = regional. With reduced
  // motion we skip all motion by snapping to the destination; otherwise we start
  // global (and, if auto-zoom is on, oscillate — see the effect below).
  const [t, setT] = useState(() =>
    canZoom && autoZoom && prefersReducedMotion() ? 1 : 0,
  );

  // Once the learner grabs the slider we never auto-zoom again for this reveal.
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
      setT(zoomAtTime(now - start, { idleMs, flyMs, holdMs }));
      frame = requestAnimationFrame(step); // repeats until unmount or manual input
    };
    frame = requestAnimationFrame(step);

    return () => cancelAnimationFrame(frame);
    // Re-arm only when the target (the pinned point) or the tuning changes — not
    // on every animation frame. Keyed on the primitive coordinate rather than
    // the `regionExtent` object so a fresh-but-equal payload can't restart it.
  }, [canZoom, autoZoom, idleMs, flyMs, holdMs, lat, lon]);

  function onScrub(next: number) {
    manualRef.current = true; // cancels the oscillation (the rAF loop bails on this)
    setT(next);
  }

  // The viewBox is the framing rectangle in projected space, interpolated along
  // the track. Without a regional target it is simply the whole world.
  const view = regionView ? interpolateView(WORLD_VIEW, regionView, t) : WORLD_VIEW;

  // Marks are authored in full-world units; scale them by how zoomed-in the
  // frame is so pin/label/coords stay roughly the same on-screen size at any
  // extent. Strokes use non-scaling-stroke instead (constant pixel width).
  const s = view.w / WIDTH;

  return (
    <div className="map-aid-viewport">
      <svg
        className="map-aid"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={hasCoords ? `Map showing the location of ${label}` : "World map"}
      >
        <rect className="map-aid__ocean" x={view.x} y={view.y} width={view.w} height={view.h} />
        <path className="map-aid__land" d={WORLD_LAND_PATH} vectorEffect="non-scaling-stroke" />
        {hasCoords && localGeoJSON && (
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

        {hasCoords && (
          <MapMarks lat={lat} lon={lon} label={label} view={view} scale={s} />
        )}
      </svg>

      {/* Reserved regardless of whether a slider is shown, so the asking
          (no coords) and answered (coords) states are the same height —
          see the module doc (#186). */}
      <div className="map-aid__zoom-row">
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
    </div>
  );
}

/** The pin, its label, and the coordinate readout — only meaningful once a
 * coordinate exists. Split out so `MapAid` doesn't compute label placement
 * for the no-coords world view. */
function MapMarks({
  lat,
  lon,
  label,
  view,
  scale: s,
}: {
  lat: number;
  lon: number;
  label: string | undefined;
  view: { x: number; y: number; w: number; h: number };
  scale: number;
}) {
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
    <>
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
    </>
  );
}
