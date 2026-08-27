import { describe, expect, it } from "vitest";
import {
  buildAccuracyByPack,
  buildAccuracyByRelation,
  buildAccuracyOverTime,
  buildHardestEasiestCards,
  buildLeaderboard,
  buildVolumeOverTime,
} from "./leaderboard.js";
import { buildResultRows } from "./resultsProjection.js";
import { fixtureReadStorePack } from "./test-fixtures.js";
import type { AdminUser } from "./read-store.js";

const users: AdminUser[] = [
  { id: "u1", email: "a@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: null },
  { id: "u2", email: "b@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: null },
];

const answers = [
  { userId: "u1", cardId: "S1:object", input: "Japan", correct: true, askedAt: "2026-08-20T00:00:00.000Z" },
  { userId: "u1", cardId: "S1:object", input: "Japan", correct: true, askedAt: "2026-08-21T00:00:00.000Z" },
  { userId: "u2", cardId: "S2:object", input: "wrong", correct: false, askedAt: "2026-08-21T00:00:00.000Z" },
];

describe("time-series and by-key charts", () => {
  const rows = buildResultRows(fixtureReadStorePack(), users, answers);

  it("buckets accuracy and volume by day", () => {
    expect(buildAccuracyOverTime(rows)).toEqual([
      { date: "2026-08-20", count: 1, accuracy: 1 },
      { date: "2026-08-21", count: 2, accuracy: 0.5 },
    ]);
    expect(buildVolumeOverTime(rows)).toEqual([
      { date: "2026-08-20", count: 1 },
      { date: "2026-08-21", count: 2 },
    ]);
  });

  it("breaks accuracy down by pack and by Relation", () => {
    expect(buildAccuracyByPack(rows)).toEqual([
      { key: "other-pack", count: 1, accuracy: 0 },
      { key: "test-pack", count: 2, accuracy: 1 },
    ]);
    expect(buildAccuracyByRelation(rows)).toEqual([
      { key: "capital_of", count: 1, accuracy: 0 },
      { key: "located_in", count: 2, accuracy: 1 },
    ]);
  });
});

describe("buildLeaderboard", () => {
  it("ranks by ability (from pack_ability), by accuracy, and by volume", () => {
    const rows = buildResultRows(fixtureReadStorePack(), users, answers);
    const packAbilities = [
      { userId: "u1", packId: "test-pack", ability: 1600 },
      { userId: "u2", packId: "other-pack", ability: 1400 },
    ];

    const board = buildLeaderboard(users, packAbilities, {}, rows);

    expect(board.byAbility).toEqual([
      { userId: "u1", userEmail: "a@example.com", packId: "test-pack", ability: 1600 },
      { userId: "u2", userEmail: "b@example.com", packId: "other-pack", ability: 1400 },
    ]);
    expect(board.byAccuracy).toEqual([
      { userId: "u1", userEmail: "a@example.com", accuracy: 1 },
      { userId: "u2", userEmail: "b@example.com", accuracy: 0 },
    ]);
    expect(board.byVolume).toEqual([
      { userId: "u1", userEmail: "a@example.com", volume: 2 },
      { userId: "u2", userEmail: "b@example.com", volume: 1 },
    ]);
  });

  it("honors a packId/userId filter on the ability board", () => {
    const rows = buildResultRows(fixtureReadStorePack(), users, answers);
    const packAbilities = [
      { userId: "u1", packId: "test-pack", ability: 1600 },
      { userId: "u2", packId: "other-pack", ability: 1400 },
    ];
    const board = buildLeaderboard(users, packAbilities, { packId: "test-pack" }, rows);
    expect(board.byAbility).toEqual([{ userId: "u1", userEmail: "a@example.com", packId: "test-pack", ability: 1600 }]);
  });
});

describe("buildHardestEasiestCards", () => {
  it("sorts the global card_difficulty cache by difficulty, resolved for display", () => {
    const pack = fixtureReadStorePack();
    const cardDifficulties = [
      { cardId: "S1:object", difficulty: 1600, answerCount: 5 },
      { cardId: "S2:object", difficulty: 1400, answerCount: 3 },
    ];
    const { hardestCards, easiestCards } = buildHardestEasiestCards(pack, cardDifficulties);
    expect(hardestCards[0]).toEqual({ cardId: "S1:object", difficulty: 1600, answerCount: 5, statementId: "S1", relation: "located_in", packId: "test-pack" });
    expect(easiestCards[0]).toEqual({ cardId: "S2:object", difficulty: 1400, answerCount: 3, statementId: "S2", relation: "capital_of", packId: "other-pack" });
  });

  it("leaves resolved fields absent for a card no longer in the graph", () => {
    const pack = fixtureReadStorePack();
    const { hardestCards } = buildHardestEasiestCards(pack, [{ cardId: "gone:object", difficulty: 1500, answerCount: 1 }]);
    expect(hardestCards).toEqual([{ cardId: "gone:object", difficulty: 1500, answerCount: 1 }]);
  });
});
