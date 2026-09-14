import type { AbilityHistory } from "@geo/contract";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AbilityChart } from "./AbilityChart.js";

function legendItems() {
  const legend = screen.getByRole("list");
  return within(legend).getAllByRole("listitem");
}

describe("AbilityChart", () => {
  it("renders the empty state and no legend when there are no points", () => {
    render(<AbilityChart points={[]} />);
    expect(screen.getByText(/no answers yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("renders one legend entry per engaged pack, labelled by pack name", () => {
    const points: AbilityHistory = [
      { askedAt: "2026-08-20T09:00:00.000Z", packId: "capitals", packLabel: "Capital Cities", ability: 1500 },
      { askedAt: "2026-08-20T09:05:00.000Z", packId: "flags", packLabel: "Flags", ability: 1400 },
      { askedAt: "2026-08-21T09:00:00.000Z", packId: "capitals", packLabel: "Capital Cities", ability: 1560 },
    ];
    render(<AbilityChart points={points} />);
    const items = legendItems();
    expect(items).toHaveLength(2);
    expect(screen.getByText("Capital Cities")).toBeInTheDocument();
    expect(screen.getByText("Flags")).toBeInTheDocument();
  });

  it("ranks the legend by current ability, highest first — not by pack order", () => {
    const points: AbilityHistory = [
      { askedAt: "2026-08-20T09:00:00.000Z", packId: "low", packLabel: "Low Pack", ability: 1200 },
      { askedAt: "2026-08-20T09:05:00.000Z", packId: "high", packLabel: "High Pack", ability: 1800 },
    ];
    render(<AbilityChart points={points} />);
    const items = legendItems();
    // "high" was engaged second but leads the leaderboard on current ability.
    expect(items[0]).toHaveTextContent("High Pack");
    expect(items[0]).toHaveTextContent("1800");
    expect(items[1]).toHaveTextContent("Low Pack");
  });

  it("reads the change since a pack's first engaged day, with a direction word", () => {
    const points: AbilityHistory = [
      { askedAt: "2026-08-20T09:00:00.000Z", packId: "capitals", packLabel: "Capital Cities", ability: 1500 },
      { askedAt: "2026-08-22T09:00:00.000Z", packId: "capitals", packLabel: "Capital Cities", ability: 1560 },
    ];
    render(<AbilityChart points={points} />);
    const item = legendItems()[0];
    expect(item).toHaveTextContent(/up 60/i);
  });

  it("falls back to the pack id when no point names the pack", () => {
    const points: AbilityHistory = [
      { askedAt: "2026-08-20T09:00:00.000Z", packId: "orphan-pack", ability: 1500 },
    ];
    render(<AbilityChart points={points} />);
    expect(screen.getByText("orphan-pack")).toBeInTheDocument();
  });

  it("labels the overall line 'Overall' in the legend, apart from the ranked packs", () => {
    const points: AbilityHistory = [
      { askedAt: "2026-08-20T09:00:00.000Z", packId: "a", packLabel: "Pack A", ability: 1500 },
      { askedAt: "2026-08-20T09:05:00.000Z", packId: "b", packLabel: "Pack B", ability: 1300 },
    ];
    render(<AbilityChart points={points} />);
    // "Overall" is read out, and its current value is the mean (1400).
    expect(screen.getByText("Overall")).toBeInTheDocument();
    // It is not one of the ranked pack list items.
    const rankedLabels = legendItems().map((li) => within(li).getByText(/Pack [AB]|Overall/).textContent);
    expect(rankedLabels).toEqual(["Pack A", "Pack B"]);
  });

  it("draws the overall line visually distinct from the per-pack lines", () => {
    const points: AbilityHistory = [
      { askedAt: "2026-08-20T09:00:00.000Z", packId: "a", packLabel: "Pack A", ability: 1500 },
      { askedAt: "2026-08-21T09:00:00.000Z", packId: "a", packLabel: "Pack A", ability: 1600 },
      { askedAt: "2026-08-21T09:05:00.000Z", packId: "b", packLabel: "Pack B", ability: 1400 },
    ];
    const { container } = render(<AbilityChart points={points} />);
    // The overall polyline carries the distinct class, separate from the ramp.
    expect(container.querySelector("polyline.ability-chart__overall")).not.toBeNull();
  });

  it("renders the single-pack case (overall coincides with the pack) without error", () => {
    const points: AbilityHistory = [
      { askedAt: "2026-08-20T09:00:00.000Z", packId: "solo", packLabel: "Solo Pack", ability: 1500 },
      { askedAt: "2026-08-22T09:00:00.000Z", packId: "solo", packLabel: "Solo Pack", ability: 1560 },
    ];
    render(<AbilityChart points={points} />);
    expect(screen.getByText("Overall")).toBeInTheDocument();
    expect(screen.getByText("Solo Pack")).toBeInTheDocument();
    expect(legendItems()).toHaveLength(1);
  });

  it("draws a marker rather than a zero-length line for a single day of data", () => {
    const points: AbilityHistory = [
      { askedAt: "2026-08-20T09:00:00.000Z", packId: "capitals", packLabel: "Capital Cities", ability: 1500 },
    ];
    const { container } = render(<AbilityChart points={points} />);
    expect(container.querySelector("circle.ability-chart__marker")).not.toBeNull();
    expect(container.querySelector("polyline")).toBeNull();
    // A single day carries no change yet.
    expect(legendItems()[0]).toHaveTextContent(/no change yet/i);
  });
});
