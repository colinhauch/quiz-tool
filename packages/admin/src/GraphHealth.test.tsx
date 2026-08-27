import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphHealth } from "./GraphHealth.js";
import { usePacksFocus } from "./navigation.js";

const REPORT = {
  checks: [
    {
      id: "orphaned-entities",
      label: "Orphaned entities",
      count: 1,
      items: [{ targetType: "entity", targetId: "Q999", detail: "in no statement" }],
    },
    {
      id: "uncovered-statements",
      label: "Uncovered statements",
      count: 1,
      items: [{ targetType: "statement", targetId: "s1", packId: "p", detail: "no generator" }],
    },
    { id: "missing-visual-aid", label: "Missing coordinates / visual aid", count: 0, items: [] },
    { id: "duplicate-ownership", label: "Duplicate relation definitions / conflicting owners", count: 0, items: [] },
  ],
};

function CaptureFocus() {
  const focus = usePacksFocus();
  return <div data-testid="focus">{focus ? JSON.stringify(focus) : "none"}</div>;
}

describe("Graph Health surface", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(REPORT), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows every check with its summary count", async () => {
    render(<GraphHealth />);
    expect(await screen.findByText("Orphaned entities")).toBeInTheDocument();
    expect(screen.getByText("Uncovered statements")).toBeInTheDocument();
    expect(screen.getAllByText("1")).toHaveLength(2);
    expect(screen.getAllByText("0")).toHaveLength(2);
  });

  it("drills a failing entity item to the Packs surface via a focus request", async () => {
    render(
      <>
        <GraphHealth />
        <CaptureFocus />
      </>,
    );
    fireEvent.click(await screen.findByText("Q999"));
    expect(screen.getByTestId("focus")).toHaveTextContent('{"kind":"entity","entityId":"Q999"}');
  });

  it("drills a failing statement item to its pack on the Packs surface", async () => {
    render(
      <>
        <GraphHealth />
        <CaptureFocus />
      </>,
    );
    fireEvent.click(await screen.findByText("s1"));
    expect(screen.getByTestId("focus")).toHaveTextContent('{"kind":"statement","packId":"p","statementId":"s1"}');
  });
});
