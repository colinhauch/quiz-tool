import { describe, expect, it } from "vitest";
import { applyAnswer, emptyRatings } from "@geo/engine";
import { computeAbilityTrajectory } from "./abilityTrajectory.js";
import { fixtureReadStorePack } from "./test-fixtures.js";

describe("computeAbilityTrajectory", () => {
  it("returns one point per answer that actually moves a rating, matching applyAnswer step by step", () => {
    const pack = fixtureReadStorePack();
    const answers = [
      { userId: "u1", cardId: "S1:object", input: "Japan", correct: true, askedAt: "2026-08-20T00:00:00.000Z" },
      { userId: "u1", cardId: "S1:object", input: "Nope", correct: false, askedAt: "2026-08-21T00:00:00.000Z" },
    ];

    const trajectory = computeAbilityTrajectory(pack, "u1", answers);
    expect(trajectory).toHaveLength(2);
    expect(trajectory[0]).toEqual({ askedAt: "2026-08-20T00:00:00.000Z", packId: "test-pack", ability: expect.any(Number) });

    // Re-derive the same two steps directly through applyAnswer and confirm they match exactly.
    let ratings = emptyRatings();
    const step1 = applyAnswer(ratings, { cardId: "S1:object", learnerId: "u1", correct: true }, "test-pack");
    ratings = step1.ratings;
    const step2 = applyAnswer(ratings, { cardId: "S1:object", learnerId: "u1", correct: false }, "test-pack");

    expect(trajectory[0]?.ability).toBe(step1.snapshot?.ability);
    expect(trajectory[1]?.ability).toBe(step2.snapshot?.ability);
  });

  it("skips an answer whose card no longer resolves to a pack", () => {
    const pack = fixtureReadStorePack();
    const answers = [{ userId: "u1", cardId: "unknown:object", input: "x", correct: true, askedAt: "2026-08-20T00:00:00.000Z" }];
    expect(computeAbilityTrajectory(pack, "u1", answers)).toEqual([]);
  });
});
