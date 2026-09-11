import type { VisualAid as VisualAidData } from "@geo/contract";
import { fireEvent, render } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VisualAid } from "./VisualAid.js";
import { MapAid } from "./MapAid.js";
import { WORLD_ASPECT, WORLD_VIEW, type View, extentToView, fitAspect } from "./mapZoom.js";
import { DEFAULT_PROJECTION_ID, PROJECTIONS, type ProjectionId, geoBounds } from "./projection.js";

const tokyo: VisualAidData = {
  kind: "map",
  entityId: "Q1490",
  lat: 35.6895,
  lon: 139.6917,
  label: "Tokyo",
};

const enriched: VisualAidData = {
  ...tokyo,
  regionExtent: { minLon: 138.19, minLat: 34.69, maxLon: 141.19, maxLat: 36.69 },
  localGeoJSON: {
    type: "MultiPolygon",
    coordinates: [[[[139, 35], [140, 35], [140, 36], [139, 35]]]],
  },
};
/** Format a `View` exactly as `MapAid` renders its `viewBox` attribute. */
function viewBox(v: View): string {
  return `${v.x} ${v.y} ${v.w} ${v.h}`;
}

// Expected frames derived from the active projection (Equal Earth, #219) rather
// than hard-coded numbers, so these track the default projection by construction
// — the same computation MapAid performs.
const REGION_EXTENT = { minLon: 138.19, minLat: 34.69, maxLon: 141.19, maxLat: 36.69 };
const REGION_VIEW = fitAspect(extentToView(REGION_EXTENT), WORLD_ASPECT);
const WORLD_VIEWBOX = viewBox(WORLD_VIEW);

// A country boundary far from Tokyo's coordinate/regionExtent, so a frame aimed
// at the boundary is unmistakably distinct from one aimed at `regionExtent`.
// Boundary lon [100,120], lat [0,20], well away from Japan.
// Wound clockwise, as d3-geo (and the real Natural Earth data) require.
const BOUNDARY_GEO = {
  type: "MultiPolygon" as const,
  coordinates: [[[[100, 0], [100, 20], [120, 20], [120, 0], [100, 0]]]],
};
const withBoundary: VisualAidData = { ...enriched, boundaryGeoJSON: BOUNDARY_GEO };

/** Parse an `x y w h` viewBox string into numbers. */
function parseViewBox(el: Element | null): { x: number; y: number; w: number; h: number } {
  const [x, y, w, h] = (el?.getAttribute("viewBox") ?? "").split(" ").map(Number);
  return { x: x!, y: y!, w: w!, h: h! };
}

/** Assert an svg's viewBox matches `view` — numerically, since the rendered
 * frame is a lerp toward the target (`t=1` is not bit-exactly the target). */
function expectViewBox(el: Element | null, view: View) {
  const v = parseViewBox(el);
  expect(v.x).toBeCloseTo(view.x);
  expect(v.y).toBeCloseTo(view.y);
  expect(v.w).toBeCloseTo(view.w);
  expect(v.h).toBeCloseTo(view.h);
}

/** Force `prefers-reduced-motion` on/off (jsdom has no matchMedia by default). */
function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: reduce,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VisualAid", () => {
  it("renders a map with a point, the label, and the coordinate for a map descriptor", () => {
    const { container, getByText, getByRole } = render(<VisualAid visual={tokyo} />);

    expect(getByRole("img")).toBeInTheDocument();
    expect(container.querySelector("circle")).toBeInTheDocument();
    expect(getByText("Tokyo")).toBeInTheDocument();
    expect(getByText("35.69, 139.69")).toBeInTheDocument();
  });

  it("composites the base + hi-res overlay and offers a zoom slider when regional data is present (#155, #156)", () => {
    const { container, getByRole } = render(<VisualAid visual={enriched} />);

    // Base + hi-res overlay both drawn, in one viewport.
    expect(container.querySelector(".map-aid__land")).toBeInTheDocument();
    expect(container.querySelector(".map-aid__local")).toBeInTheDocument();
    // A 1-D zoom track toward the fixed target.
    expect(getByRole("slider")).toBeInTheDocument();
  });

  it("appears at global scale before any zoom (auto-zoom off, motion allowed) (#156)", () => {
    const { container } = render(<VisualAid visual={enriched} autoZoom={false} />);
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", WORLD_VIEWBOX);
  });

  it("frames the regional extent when the slider is dragged all the way in (#156)", () => {
    const { container, getByRole } = render(<VisualAid visual={enriched} />);
    fireEvent.change(getByRole("slider"), { target: { value: "1" } });
    expectViewBox(container.querySelector("svg"), REGION_VIEW);
  });

  it("snaps to the regional framing with no fly under reduced motion (#156)", () => {
    stubReducedMotion(true);
    const { container } = render(<VisualAid visual={enriched} autoZoom />);
    expectViewBox(container.querySelector("svg"), REGION_VIEW);
  });

  it("falls back to full-world framing, no overlay, and no slider without regional data", () => {
    const { container, queryByRole } = render(<VisualAid visual={tokyo} />);
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", WORLD_VIEWBOX);
    expect(container.querySelector(".map-aid__local")).not.toBeInTheDocument();
    expect(queryByRole("slider")).not.toBeInTheDocument();
  });

  it("draws the country boundary path when a boundary is present (#203)", () => {
    const { container } = render(<VisualAid visual={withBoundary} />);
    expect(container.querySelector(".map-aid__boundary")).toBeInTheDocument();
  });

  it("has no boundary path for a plain map descriptor (seam-crosser / no-match fallback)", () => {
    const { container } = render(<VisualAid visual={enriched} />);
    expect(container.querySelector(".map-aid__boundary")).not.toBeInTheDocument();
  });

  it("frames the boundary's own extent, not the coarse regionExtent, when zoomed in (#203)", () => {
    const { container, getByRole } = render(<VisualAid visual={withBoundary} />);
    fireEvent.change(getByRole("slider"), { target: { value: "1" } });
    const v = parseViewBox(container.querySelector("svg"));
    // Centered on the boundary's projected bbox center (padding + aspect-fit both
    // grow around that center) — nowhere near the regionExtent-derived frame.
    const [[bx0, by0], [bx1, by1]] = geoBounds(BOUNDARY_GEO);
    expect(v.x + v.w / 2).toBeCloseTo((bx0 + bx1) / 2);
    expect(v.y + v.h / 2).toBeCloseTo((by0 + by1) / 2);
    // The regionExtent frame is centered elsewhere: this really is boundary-framed.
    const region = fitAspect(extentToView(REGION_EXTENT), WORLD_ASPECT);
    expect(Math.abs(v.x + v.w / 2 - (region.x + region.w / 2))).toBeGreaterThan(10);
    // Padded (8%) then aspect-fitted to the world aspect.
    expect(v.w / v.h).toBeCloseTo(WORLD_ASPECT);
  });

  it("treats an empty boundary (all-sub-pixel archipelago) as absent: no path, frames by regionExtent", () => {
    const emptyBoundary: VisualAidData = {
      ...enriched,
      boundaryGeoJSON: { type: "MultiPolygon", coordinates: [] },
    };
    const { container, getByRole } = render(<VisualAid visual={emptyBoundary} />);
    expect(container.querySelector(".map-aid__boundary")).not.toBeInTheDocument();
    fireEvent.change(getByRole("slider"), { target: { value: "1" } });
    // Falls back to the coarse regionExtent frame, never a NaN viewBox.
    expectViewBox(container.querySelector("svg"), REGION_VIEW);
  });

  it("renders nothing when there is no visual", () => {
    const { container } = render(<VisualAid visual={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the bare zoomed-out world with no pin/label/coords/slider when there are no coordinates (#186)", () => {
    const { container, queryByRole, queryByText } = render(<MapAid />);

    expect(container.querySelector("svg")).toHaveAttribute("viewBox", WORLD_VIEWBOX);
    expect(container.querySelector(".map-aid__land")).toBeInTheDocument();
    expect(container.querySelector("circle")).not.toBeInTheDocument();
    expect(container.querySelector(".map-aid__label")).not.toBeInTheDocument();
    expect(container.querySelector(".map-aid__coords")).not.toBeInTheDocument();
    expect(queryByRole("slider")).not.toBeInTheDocument();
    expect(queryByText("Tokyo")).not.toBeInTheDocument();
  });

  it("reserves the same slider-row footprint with and without coordinates (#186)", () => {
    const { container: noCoords } = render(<MapAid />);
    const { container: withCoords } = render(<VisualAid visual={enriched} />);

    const noCoordsRow = noCoords.querySelector(".map-aid__zoom-row");
    const withCoordsRow = withCoords.querySelector(".map-aid__zoom-row");
    expect(noCoordsRow).toBeInTheDocument();
    expect(withCoordsRow).toBeInTheDocument();
  });

  // A stateful wrapper mirroring how Quiz owns the session-local projection:
  // the selector calls back, state flips upstream, the map re-renders (#220).
  function ProjectionHarness({ visual }: { visual: VisualAidData }) {
    const [pid, setPid] = useState<ProjectionId>(DEFAULT_PROJECTION_ID);
    return <VisualAid visual={visual} projectionId={pid} onProjectionChange={setPid} />;
  }

  it("shows no projection selector without a change handler (signed-out surface) (#220)", () => {
    const { queryByRole } = render(<VisualAid visual={tokyo} />);
    expect(queryByRole("combobox")).not.toBeInTheDocument();
    // The map still renders, on the default projection.
    expect(queryByRole("img")).toBeInTheDocument();
  });

  it("renders the selector listing the registry's projections, defaulting to Equal Earth (#220)", () => {
    const { getByRole, getAllByRole } = render(<ProjectionHarness visual={tokyo} />);
    const select = getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("equal-earth");
    expect(getAllByRole("option").map((o) => o.textContent)).toEqual(
      PROJECTIONS.map((p) => p.label),
    );
  });

  it("switches pins, land, and zoom framing to the chosen projection live (#220)", () => {
    const { container, getByRole } = render(<ProjectionHarness visual={tokyo} />);
    const svg = () => container.querySelector("svg");
    const land = () => container.querySelector(".map-aid__land")?.getAttribute("d");
    const pin = () => {
      const c = container.querySelector("circle");
      return { cx: c?.getAttribute("cx"), cy: c?.getAttribute("cy") };
    };

    // Default: Equal Earth — world frame is the default WORLD_VIEW, not 0 0 360 180.
    expect(svg()).toHaveAttribute("viewBox", viewBox(WORLD_VIEW));
    const equalEarthLand = land();
    const equalEarthPin = pin();

    fireEvent.change(getByRole("combobox"), { target: { value: "equirectangular" } });

    // Equirectangular's projected sphere bounds are exactly 0 0 360 180, and the
    // pin lands at the closed form (lon+180, 90-lat) = Tokyo (319.69, 54.31).
    expect(svg()).toHaveAttribute("viewBox", "0 0 360 180");
    expect(pin().cx).not.toBe(equalEarthPin.cx);
    expect(Number(pin().cx)).toBeCloseTo(tokyo.lat !== undefined ? tokyo.lon! + 180 : 0);
    expect(Number(pin().cy)).toBeCloseTo(90 - tokyo.lat!);
    // Land silhouette is the equirectangular baked path — a different string.
    expect(land()).not.toBe(equalEarthLand);
  });

  it("renders an image descriptor as an <img> with its src and generic alt (#180)", () => {
    const flag: VisualAidData = { kind: "image", src: "/flags/jp.svg", alt: "Flag of a country" };
    const { getByRole } = render(<VisualAid visual={flag} slot="prompt" />);
    const img = getByRole("img");
    expect(img).toHaveAttribute("src", "/flags/jp.svg");
    // The alt is deliberately non-revealing — the answer must not leak here.
    expect(img).toHaveAttribute("alt", "Flag of a country");
  });
});
