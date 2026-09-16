import type { VisualAid as VisualAidData } from "@geo/contract";
import { ImageAid } from "./ImageAid.js";
import { MapAid } from "./MapAid.js";
import type { ProjectionId } from "./projection.js";

/**
 * The generic visual slot — used for both the prompt-time and reveal-time
 * positions in the card. Dispatches on `kind`: it knows nothing about
 * entities or coordinates, only how to route a descriptor to the component
 * that draws it. Undefined or an unknown kind renders nothing, so no
 * wrapper element exists and no space is reserved.
 *
 * `slot` only adds a modifier class (`visual-aid--prompt` / `visual-aid--reveal`)
 * so the two positions can be spaced differently in CSS; it has no effect on
 * what gets rendered.
 *
 * `autoZoom` is the learner's persisted auto-zoom preference, forwarded to the
 * map; the slot itself is otherwise oblivious to what any descriptor does.
 *
 * `projectionId` is the learner's account-synced map projection, forwarded to the
 * map. A caller that omits it gets the default projection; the choice itself is
 * made in Settings (#235), never here.
 */
export function VisualAid({
  visual,
  slot,
  autoZoom,
  projectionId,
}: {
  visual: VisualAidData | undefined;
  slot?: "prompt" | "reveal";
  autoZoom?: boolean;
  projectionId?: ProjectionId;
}) {
  if (!visual) return null;

  const rendered = (() => {
    switch (visual.kind) {
      case "map":
        return (
          <MapAid
            lat={visual.lat}
            lon={visual.lon}
            label={visual.label}
            localGeoJSON={visual.localGeoJSON}
            regionExtent={visual.regionExtent}
            boundaryGeoJSON={visual.boundaryGeoJSON}
            autoZoom={autoZoom}
            projectionId={projectionId}
          />
        );
      case "image":
        return <ImageAid src={visual.src} alt={visual.alt} />;
      default:
        return null;
    }
  })();

  if (!rendered) return null;

  return (
    <div className={`visual-aid${slot ? ` visual-aid--${slot}` : ""}`}>{rendered}</div>
  );
}
