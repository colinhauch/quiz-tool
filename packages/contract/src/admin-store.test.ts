import { describe, expect, it } from "vitest";
import { adminUserAggregateSchema, adminUserDetailSchema, adminUserListSchema } from "./admin-store.js";

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
