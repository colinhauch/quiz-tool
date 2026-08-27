import { describe, expect, it } from "vitest";
import { buildUserDetail, resolveAnswerLogEntry } from "./userDetailProjection.js";
import { fixtureReadStorePack } from "./test-fixtures.js";
import type { AdminUser } from "./read-store.js";

const USER: AdminUser = { id: "u1", email: "a@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: "2026-08-20T00:00:00.000Z" };

describe("resolveAnswerLogEntry", () => {
  it("resolves a card that is still in the graph", () => {
    const pack = fixtureReadStorePack();
    const entry = resolveAnswerLogEntry(pack, {
      userId: "u1",
      cardId: "S1:object",
      input: "Japan",
      correct: true,
      askedAt: "2026-08-20T00:00:00.000Z",
    });
    expect(entry).toEqual({
      cardId: "S1:object",
      input: "Japan",
      correct: true,
      askedAt: "2026-08-20T00:00:00.000Z",
      statementId: "S1",
      relation: "located_in",
      packId: "test-pack",
      subjectEntityId: "Q1490",
    });
  });

  it("leaves resolved fields absent for a card no longer in the graph", () => {
    const pack = fixtureReadStorePack();
    const entry = resolveAnswerLogEntry(pack, {
      userId: "u1",
      cardId: "gone:object",
      input: "x",
      correct: false,
      askedAt: "2026-08-20T00:00:00.000Z",
    });
    expect(entry).toEqual({ cardId: "gone:object", input: "x", correct: false, askedAt: "2026-08-20T00:00:00.000Z" });
  });
});

describe("buildUserDetail", () => {
  it("builds abilities, aggregate, recent answers (newest first), and a trajectory", () => {
    const pack = fixtureReadStorePack();
    const answers = [
      { userId: "u1", cardId: "S1:object", input: "Japan", correct: true, askedAt: "2026-08-20T00:00:00.000Z" },
      { userId: "u1", cardId: "S2:object", input: "Germany", correct: false, askedAt: "2026-08-21T00:00:00.000Z" },
    ];
    const packAbilities = [
      { userId: "u1", packId: "test-pack", ability: 1520 },
      { userId: "u2", packId: "test-pack", ability: 1600 }, // another user — must not leak in
    ];

    const detail = buildUserDetail(pack, USER, answers, packAbilities);

    expect(detail.user).toEqual(USER);
    expect(detail.abilities).toEqual([{ packId: "test-pack", packLabel: "Test Pack", ability: 1520 }]);
    expect(detail.aggregate).toEqual({
      totalAnswers: 2,
      accuracy: 0.5,
      packsTouched: ["test-pack", "other-pack"],
      lastActiveAt: "2026-08-21T00:00:00.000Z",
    });
    expect(detail.recentAnswers.map((a) => a.cardId)).toEqual(["S2:object", "S1:object"]);
    expect(detail.trajectory).toHaveLength(2);
  });

  it("handles a user with no answers", () => {
    const pack = fixtureReadStorePack();
    const detail = buildUserDetail(pack, USER, [], []);
    expect(detail.aggregate).toEqual({ totalAnswers: 0, accuracy: 0, packsTouched: [], lastActiveAt: null });
    expect(detail.recentAnswers).toEqual([]);
    expect(detail.trajectory).toEqual([]);
  });
});
