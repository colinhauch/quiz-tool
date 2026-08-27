import { describe, expect, it } from "vitest";
import {
  adminAccuracyByKeySchema,
  adminCardDifficultySchema,
  adminLeaderboardSchema,
  adminPopulationSchema,
  adminResultRowSchema,
  adminResultsChartsSchema,
  adminResultsFilterSchema,
  adminResultsResponseSchema,
  adminUserAggregateSchema,
  adminUserDetailSchema,
  adminUserListSchema,
} from "./admin-store.js";

describe("adminUserListSchema", () => {
  it("accepts a list of users, including a never-signed-in one", () => {
    const payload = [
      { id: "u1", email: "a@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: "2026-08-20T00:00:00.000Z" },
      { id: "u2", email: null, createdAt: "2026-08-02T00:00:00.000Z", lastSignInAt: null },
    ];
    expect(adminUserListSchema.parse(payload)).toEqual(payload);
  });

  it("rejects an entry missing a field", () => {
    expect(() => adminUserListSchema.parse([{ id: "u1", email: null }])).toThrow();
  });
});

describe("adminUserDetailSchema", () => {
  it("accepts a full user detail payload", () => {
    const payload = {
      user: { id: "u1", email: "a@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: null },
      abilities: [{ packId: "core-geo", packLabel: "Core Geography", ability: 1520 }],
      aggregate: { totalAnswers: 3, accuracy: 2 / 3, packsTouched: ["core-geo"], lastActiveAt: "2026-08-20T00:00:00.000Z" },
      recentAnswers: [
        {
          cardId: "S1:object",
          input: "Japan",
          correct: true,
          askedAt: "2026-08-20T00:00:00.000Z",
          statementId: "S1",
          relation: "located_in",
          packId: "core-geo",
          subjectEntityId: "Q1490",
        },
      ],
      trajectory: [{ askedAt: "2026-08-20T00:00:00.000Z", packId: "core-geo", ability: 1520 }],
    };
    expect(adminUserDetailSchema.parse(payload)).toEqual(payload);
  });
});

describe("adminUserAggregateSchema", () => {
  it("rejects an accuracy outside [0,1]", () => {
    expect(() =>
      adminUserAggregateSchema.parse({ totalAnswers: 1, accuracy: 1.5, packsTouched: [], lastActiveAt: null }),
    ).toThrow();
  });
});

describe("adminPopulationSchema", () => {
  it("accepts an aggregate population payload", () => {
    const payload = {
      totalUsers: 2,
      totalAnswers: 10,
      accuracyDistribution: [{ label: "50-75%", userCount: 2 }],
      activityByDay: [{ date: "2026-08-20", activeUsers: 2, answerCount: 10 }],
    };
    expect(adminPopulationSchema.parse(payload)).toEqual(payload);
  });
});

describe("adminResultsFilterSchema", () => {
  it("accepts every filter absent (unfiltered)", () => {
    expect(adminResultsFilterSchema.parse({})).toEqual({});
  });

  it("accepts a composed set of filters", () => {
    const payload = { userId: "u1", packId: "core-geo", relation: "located_in", correct: true, from: "2026-08-01", to: "2026-08-20" };
    expect(adminResultsFilterSchema.parse(payload)).toEqual(payload);
  });
});

describe("adminResultsResponseSchema", () => {
  it("accepts rows plus counts that summarize them", () => {
    const row = adminResultRowSchema.parse({
      cardId: "S1:object",
      input: "Japan",
      correct: true,
      askedAt: "2026-08-20T00:00:00.000Z",
      userId: "u1",
      userEmail: "a@example.com",
    });
    const payload = { rows: [row], total: 1, accuracy: 1 };
    expect(adminResultsResponseSchema.parse(payload)).toEqual(payload);
  });
});

describe("adminResultsChartsSchema", () => {
  it("accepts the full analytical payload", () => {
    const accByKey = adminAccuracyByKeySchema.parse({ key: "core-geo", count: 5, accuracy: 0.8 });
    const leaderboard = adminLeaderboardSchema.parse({ byAbility: [], byAccuracy: [], byVolume: [] });
    const card = adminCardDifficultySchema.parse({ cardId: "S1:object", difficulty: 1480, answerCount: 3 });
    const payload = {
      accuracyOverTime: [{ date: "2026-08-20", count: 5, accuracy: 0.8 }],
      volumeOverTime: [{ date: "2026-08-20", count: 5 }],
      accuracyByPack: [accByKey],
      accuracyByRelation: [accByKey],
      leaderboard,
      hardestCards: [card],
      easiestCards: [card],
    };
    expect(adminResultsChartsSchema.parse(payload)).toEqual(payload);
  });
});
