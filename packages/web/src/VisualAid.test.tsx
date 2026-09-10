import type { VisualAid as VisualAidData } from "@geo/contract";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VisualAid } from "./VisualAid.js";
import { MapAid } from "./MapAid.js";

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
// The regional extent (318.19 53.31 3×2) fitted to the world's 2:1 aspect:
// widened to 4×2 around the same center, so the frame never changes shape.
const REGION_VIEWBOX = "317.69 53.31 4 2";
const WORLD_VIEWBOX = "0 0 360 180";

// A country boundary far from Tokyo's coordinate/regionExtent, so a frame aimed
// at the boundary is unmistakably distinct from one aimed at `regionExtent`.
// Boundary lon [100,120], lat [0,20] → center (110, 10) → projected (290, 80).
// Wound clockwise, as d3-geo (and the real Natural Earth data) require.
const withBoundary: VisualAidData = {
  ...enriched,
  boundaryGeoJSON: {
    type: "MultiPolygon",
    coordinates: [[[[100, 0], [100, 20], [120, 20], [120, 0], [100, 0]]]],
  },
};

/** Parse an `x y w h` viewBox string into numbers. */
function parseViewBox(el: Element | null): { x: number; y: number; w: number; h: number } {
  const [x, y, w, h] = (el?.getAttribute("viewBox") ?? "").split(" ").map(Number);
  return { x: x!, y: y!, w: w!, h: h! };
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
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", REGION_VIEWBOX);
  });

  it("snaps to the regional framing with no fly under reduced motion (#156)", () => {
    stubReducedMotion(true);
    const { container } = render(<VisualAid visual={enriched} autoZoom />);
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", REGION_VIEWBOX);
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
    // Centered on the boundary's projected center (290, 80) — nowhere near the
    // regionExtent-derived frame (center ~319.69, 54.31).
    expect(v.x + v.w / 2).toBeCloseTo(290);
    expect(v.y + v.h / 2).toBeCloseTo(80);
    // Padded (8%) then aspect-fitted to 2:1 → wider than the raw 20° span.
    expect(v.w / v.h).toBeCloseTo(2); // WORLD_ASPECT
    expect(v.w).toBeGreaterThan(20);
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
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", REGION_VIEWBOX);
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

  it("renders an image descriptor as an <img> with its src and generic alt (#180)", () => {
    const flag: VisualAidData = { kind: "image", src: "/flags/jp.svg", alt: "Flag of a country" };
    const { getByRole } = render(<VisualAid visual={flag} slot="prompt" />);
    const img = getByRole("img");
    expect(img).toHaveAttribute("src", "/flags/jp.svg");
    // The alt is deliberately non-revealing — the answer must not leak here.
    expect(img).toHaveAttribute("alt", "Flag of a country");
  });
});
