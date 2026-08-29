import type { VisualAid as VisualAidData } from "@geo/contract";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VisualAid } from "./VisualAid.js";

const tokyo: VisualAidData = {
  kind: "map",
  entityId: "Q1490",
  lat: 35.6895,
  lon: 139.6917,
  label: "Tokyo",
};

describe("VisualAid", () => {
  it("renders a map with a point, the label, and the coordinate for a map descriptor", () => {
    const { container, getByText, getByRole } = render(<VisualAid visual={tokyo} />);

    expect(getByRole("img")).toBeInTheDocument();
    expect(container.querySelector("circle")).toBeInTheDocument();
    expect(getByText("Tokyo")).toBeInTheDocument();
    expect(getByText("35.69, 139.69")).toBeInTheDocument();
  });

  it("frames the regional extent and composites the hi-res overlay when present (#155)", () => {
    const enriched: VisualAidData = {
      ...tokyo,
      regionExtent: { minLon: 138.19, minLat: 34.69, maxLon: 141.19, maxLat: 36.69 },
      localGeoJSON: {
        type: "MultiPolygon",
        coordinates: [[[[139, 35], [140, 35], [140, 36], [139, 35]]]],
      },
    };
    const { container } = render(<VisualAid visual={enriched} />);

    // Base + hi-res overlay both drawn, in one viewport.
    expect(container.querySelector(".map-aid__land")).toBeInTheDocument();
    expect(container.querySelector(".map-aid__local")).toBeInTheDocument();
    // viewBox framed at the regional extent (x=minLon+180, y=90-maxLat, w, h).
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", "318.19 53.31 3 2");
  });

  it("falls back to full-world framing and no overlay without regional data", () => {
    const { container } = render(<VisualAid visual={tokyo} />);
    expect(container.querySelector("svg")).toHaveAttribute("viewBox", "0 0 360 180");
    expect(container.querySelector(".map-aid__local")).not.toBeInTheDocument();
  });

  it("renders nothing when there is no visual", () => {
    const { container } = render(<VisualAid visual={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
