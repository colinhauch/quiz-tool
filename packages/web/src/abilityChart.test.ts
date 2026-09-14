import type { AbilityPoint } from "@geo/contract";
import { describe, expect, it } from "vitest";
import { abilitySeriesOf } from "./abilityChart.js";

/** A point builder that keeps the tests reading as the behaviour they assert. */
function point(askedAt: string, packId: string, ability: number, packLabel?: string): AbilityPoint {
  return { askedAt, packId, ability, ...(packLabel === undefined ? {} : { packLabel }) };
}

describe("abilitySeriesOf", () => {
  it("returns no days and no series for empty input", () => {
    expect(abilitySeriesOf([])).toEqual({ days: [], series: [] });
  });

  it("keeps the last snapshot of a UTC day, not the first", () => {
    const model = abilitySeriesOf([
      point("2026-08-20T08:00:00.000Z", "capitals", 1500),
      point("2026-08-20T20:00:00.000Z", "capitals", 1540),
    ]);
    expect(model.days).toEqual(["2026-08-20"]);
    expect(model.series).toHaveLength(1);
    expect(model.series[0]?.values).toEqual([{ day: "2026-08-20", ability: 1540 }]);
    expect(model.series[0]?.latest).toBe(1540);
    // First engaged value is the first day's *last* snapshot too.
    expect(model.series[0]?.first).toBe(1540);
  });

  it("buckets by UTC day regardless of the order points arrive in", () => {
    const model = abilitySeriesOf([
      point("2026-08-21T09:00:00.000Z", "capitals", 1600),
      point("2026-08-20T09:00:00.000Z", "capitals", 1500),
      point("2026-08-20T23:30:00.000Z", "capitals", 1520),
    ]);
    expect(model.days).toEqual(["2026-08-20", "2026-08-21"]);
    expect(model.series[0]?.values).toEqual([
      { day: "2026-08-20", ability: 1520 },
      { day: "2026-08-21", ability: 1600 },
    ]);
  });

  it("holds a pack's last value flat across a day another pack was played", () => {
    // The 21st is on the axis because *flags* was played then; capitals wasn't,
    // so its line holds flat across it. A day nobody played is not a column.
    const model = abilitySeriesOf([
      point("2026-08-20T09:00:00.000Z", "capitals", 1500),
      point("2026-08-21T09:00:00.000Z", "flags", 1400),
      point("2026-08-22T09:00:00.000Z", "capitals", 1560),
    ]);
    expect(model.days).toEqual(["2026-08-20", "2026-08-21", "2026-08-22"]);
    const capitals = model.series.find((s) => s.packId === "capitals");
    expect(capitals?.values).toEqual([
      { day: "2026-08-20", ability: 1500 },
      { day: "2026-08-21", ability: 1500 },
      { day: "2026-08-22", ability: 1560 },
    ]);
  });

  it("starts a pack's line on its first engaged day and holds it to the last overall day", () => {
    const model = abilitySeriesOf([
      point("2026-08-20T09:00:00.000Z", "capitals", 1500),
      point("2026-08-22T09:00:00.000Z", "flags", 1400),
      point("2026-08-24T09:00:00.000Z", "capitals", 1560),
    ]);
    expect(model.days).toEqual(["2026-08-20", "2026-08-22", "2026-08-24"]);
    const flags = model.series.find((s) => s.packId === "flags");
    // No back-fill before the 22nd; holds flat forward to the 24th.
    expect(flags?.values).toEqual([
      { day: "2026-08-22", ability: 1400 },
      { day: "2026-08-24", ability: 1400 },
    ]);
  });

  it("orders series by first engaged day, then packId, independent of ability", () => {
    const model = abilitySeriesOf([
      point("2026-08-22T09:00:00.000Z", "later", 1900),
      point("2026-08-20T09:00:00.000Z", "zeta", 100),
      point("2026-08-20T09:00:00.000Z", "alpha", 100),
    ]);
    // Both "zeta" and "alpha" start on the 20th → tie broken by packId; "later"
    // starts on the 22nd. Ability (1900 vs 100) never enters the ordering.
    expect(model.series.map((s) => s.packId)).toEqual(["alpha", "zeta", "later"]);
  });

  it("labels a pack from its packLabel, letting a later point supply one an earlier lacked", () => {
    const model = abilitySeriesOf([
      point("2026-08-20T09:00:00.000Z", "capitals", 1500),
      point("2026-08-21T09:00:00.000Z", "capitals", 1520, "Capital Cities"),
    ]);
    expect(model.series[0]?.label).toBe("Capital Cities");
  });

  it("falls back to the packId when no point names the pack", () => {
    const model = abilitySeriesOf([point("2026-08-20T09:00:00.000Z", "capitals", 1500)]);
    expect(model.series[0]?.label).toBe("capitals");
  });

  it("skips a point whose askedAt the browser cannot parse", () => {
    const model = abilitySeriesOf([
      point("not-a-date", "capitals", 1500),
      point("2026-08-20T09:00:00.000Z", "capitals", 1540),
    ]);
    expect(model.days).toEqual(["2026-08-20"]);
    expect(model.series[0]?.values).toEqual([{ day: "2026-08-20", ability: 1540 }]);
  });
});
