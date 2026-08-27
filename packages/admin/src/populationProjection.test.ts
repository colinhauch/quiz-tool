import { describe, expect, it } from "vitest";
import { buildPopulation } from "./populationProjection.js";
import type { AdminUser } from "./read-store.js";

const users: AdminUser[] = [
  { id: "u1", email: "a@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: null },
  { id: "u2", email: "b@example.com", createdAt: "2026-08-02T00:00:00.000Z", lastSignInAt: null },
  { id: "u3", email: null, createdAt: "2026-08-03T00:00:00.000Z", lastSignInAt: null }, // never answers
];

describe("buildPopulation", () => {
  it("aggregates counts, an accuracy distribution, and per-day activity", () => {
    const answers = [
      { userId: "u1", cardId: "S1:object", input: "x", correct: true, askedAt: "2026-08-20T00:00:00.000Z" },
      { userId: "u1", cardId: "S1:object", input: "x", correct: true, askedAt: "2026-08-20T01:00:00.000Z" },
      { userId: "u1", cardId: "S1:object", input: "x", correct: true, askedAt: "2026-08-20T02:00:00.000Z" },
      { userId: "u1", cardId: "S1:object", input: "x", correct: false, askedAt: "2026-08-21T00:00:00.000Z" },
      { userId: "u2", cardId: "S1:object", input: "x", correct: false, askedAt: "2026-08-20T00:00:00.000Z" },
    ];

    const population = buildPopulation(users, answers);

    expect(population.totalUsers).toBe(3);
    expect(population.totalAnswers).toBe(5);
    // u1: 3/4 = 75% -> "75-100%"; u2: 0/1 = 0% -> "0-25%"; u3 excluded (no answers).
    expect(population.accuracyDistribution).toEqual([
      { label: "0-25%", userCount: 1 },
      { label: "25-50%", userCount: 0 },
      { label: "50-75%", userCount: 0 },
      { label: "75-100%", userCount: 1 },
    ]);
    expect(population.activityByDay).toEqual([
      { date: "2026-08-20", activeUsers: 2, answerCount: 4 },
      { date: "2026-08-21", activeUsers: 1, answerCount: 1 },
    ]);
  });

  it("returns zeroed aggregates with no answers at all", () => {
    const population = buildPopulation(users, []);
    expect(population.totalAnswers).toBe(0);
    expect(population.accuracyDistribution.every((b) => b.userCount === 0)).toBe(true);
    expect(population.activityByDay).toEqual([]);
  });
});
