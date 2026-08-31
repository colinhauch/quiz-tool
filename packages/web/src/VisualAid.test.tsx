import type { VisualAid as VisualAidData } from "@geo/contract";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VisualAid } from "./VisualAid.js";

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

  it("renders nothing when there is no visual", () => {
    const { container } = render(<VisualAid visual={undefined} />);
    expect(container).toBeEmptyDOMElement();
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
