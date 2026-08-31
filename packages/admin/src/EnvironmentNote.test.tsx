import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EnvironmentNote } from "./EnvironmentNote.js";

describe("EnvironmentNote", () => {
  it("says a pack-graph surface does not vary by environment", () => {
    render(<EnvironmentNote kind="pack-graph" />);
    expect(screen.getByText(/local pack graph/i)).toBeTruthy();
    expect(screen.getByText(/does not vary by environment/i)).toBeTruthy();
  });

  it("says the user roster is shared while the figures beside it are not", () => {
    render(<EnvironmentNote kind="shared-roster" />);
    expect(screen.getByText(/shared across every environment/i)).toBeTruthy();
    expect(screen.getByText(/figures.*selected environment/i)).toBeTruthy();
  });
});
