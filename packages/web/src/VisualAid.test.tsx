import type { VisualAid as VisualAidData } from "@geo/contract";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VisualAid } from "./VisualAid.js";

const tokyo: VisualAidData = {
  renderer: "map",
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

  it("renders nothing when there is no visual", () => {
    const { container } = render(<VisualAid visual={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
