import { describe, expect, it } from "vitest";
import { buildEnvironmentStats } from "./environmentComparisonProjection.js";
import type { AdminAnswerRow, AdminCardDifficultyRow, AdminPackAbilityRow } from "./read-store.js";

const ANSWERS: AdminAnswerRow[] = [
  { userId: "u1", cardId: "S1:object", input: "Japan", correct: true, askedAt: "2026-08-20T00:00:00.000Z" },
  { userId: "u1", cardId: "S2:object", input: "wrong", correct: false, askedAt: "2026-08-22T00:00:00.000Z" },
  { userId: "u2", cardId: "S1:object", input: "Japan", correct: true, askedAt: "2026-08-21T00:00:00.000Z" },
];

const PACK_ABILITIES: AdminPackAbilityRow[] = [
  { userId: "u1", packId: "core-geo", ability: 1550 },
  { userId: "u2", packId: "core-geo", ability: 1480 },
  { userId: "u1", packId: "capitals", ability: 1500 },
];

const CARD_DIFFICULTIES: AdminCardDifficultyRow[] = [
  { cardId: "S1:object", difficulty: 1600, answerCount: 4 },
  { cardId: "S2:object", difficulty: 1400, answerCount: 2 },
];

describe("buildEnvironmentStats", () => {
  it("aggregates an environment with answers, ability rows, and rated cards", () => {
    const stats = buildEnvironmentStats(ANSWERS, PACK_ABILITIES, CARD_DIFFICULTIES);

    expect(stats.usersWithAnswers).toBe(2); // u1, u2
    expect(stats.totalAnswers).toBe(3);
    expect(stats.accuracy).toBeCloseTo(2 / 3);
    expect(stats.distinctCardsAnswered).toBe(2); // S1:object, S2:object
    expect(stats.firstAnswerAt).toBe("2026-08-20T00:00:00.000Z");
    expect(stats.lastAnswerAt).toBe("2026-08-22T00:00:00.000Z");
    expect(stats.packsWithAbilityRows).toBe(2); // core-geo, capitals
    expect(stats.ratedCards).toBe(2);
  });

  it("returns all zeros and null timestamps for a completely empty environment", () => {
    const stats = buildEnvironmentStats([], [], []);

    expect(stats.usersWithAnswers).toBe(0);
    expect(stats.totalAnswers).toBe(0);
    expect(stats.accuracy).toBe(0); // the division-by-zero case: 0, not NaN
    expect(stats.distinctCardsAnswered).toBe(0);
    expect(stats.firstAnswerAt).toBeNull();
    expect(stats.lastAnswerAt).toBeNull();
    expect(stats.packsWithAbilityRows).toBe(0);
    expect(stats.ratedCards).toBe(0);
  });

  it("handles an environment with answers but no ratings yet (Elo hasn't warmed up)", () => {
    const stats = buildEnvironmentStats(ANSWERS, [], []);

    expect(stats.totalAnswers).toBe(3);
    expect(stats.packsWithAbilityRows).toBe(0);
    expect(stats.ratedCards).toBe(0);
  });

  it("computes accuracy as 0 when every answer is wrong, not NaN or negative", () => {
    const allWrong: AdminAnswerRow[] = [
      { userId: "u1", cardId: "S1:object", input: "x", correct: false, askedAt: "2026-08-20T00:00:00.000Z" },
    ];
    const stats = buildEnvironmentStats(allWrong, [], []);
    expect(stats.accuracy).toBe(0);
  });
});
