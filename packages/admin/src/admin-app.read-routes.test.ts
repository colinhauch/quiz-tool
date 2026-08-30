import { describe, expect, it } from "vitest";
import {
  adminFeedbackListSchema,
  adminPopulationSchema,
  adminResultsChartsSchema,
  adminResultsResponseSchema,
  adminUserDetailSchema,
  adminUserListSchema,
} from "@geo/contract";
import { createAdminApp } from "./admin-app.js";
import {
  createInMemoryReadStore,
  type AdminAnswerRow,
  type AdminFeedbackRecord,
  type AdminUser,
} from "./read-store.js";
import { fixtureReadStorePack } from "./test-fixtures.js";

/**
 * BFF route tests for the cross-user seam (#140–#144), driven exactly as
 * `admin-app.test.ts` drives the graph-only routes: `app.request()` in
 * process, an in-memory fake in place of the real store, response parsed
 * through the `@geo/contract` schema.
 */
const USERS: AdminUser[] = [
  { id: "u1", email: "a@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: "2026-08-20T00:00:00.000Z" },
  { id: "u2", email: "b@example.com", createdAt: "2026-08-02T00:00:00.000Z", lastSignInAt: null },
];

const ANSWERS: AdminAnswerRow[] = [
  { userId: "u1", cardId: "S1:object", input: "Japan", correct: true, askedAt: "2026-08-20T00:00:00.000Z" },
  { userId: "u2", cardId: "S2:object", input: "wrong", correct: false, askedAt: "2026-08-21T00:00:00.000Z" },
];

const FEEDBACK: AdminFeedbackRecord[] = [
  { id: 1, userId: "u1", kind: "general", comment: "Love the app", status: "resolved", createdAt: "2026-08-28T00:00:00.000Z" },
  {
    id: 2,
    userId: "u2",
    kind: "question",
    cardId: "S2:object",
    comment: "The prompt is broken",
    status: "unresolved",
    createdAt: "2026-08-29T00:00:00.000Z",
  },
  {
    id: 3,
    userId: "u1",
    kind: "question",
    cardId: "S1:object",
    comment: "This question is wrong",
    status: "unresolved",
    createdAt: "2026-08-30T00:00:00.000Z",
    context: { prompt: "Capital of Japan?", packLabel: "Test Pack", packId: "test-pack", acceptedAnswers: ["Tokyo"], input: "Kyoto" },
  },
];

function buildApp() {
  const readStore = createInMemoryReadStore({
    users: USERS,
    answers: ANSWERS,
    packAbilities: [
      { userId: "u1", packId: "test-pack", ability: 1550 },
      { userId: "u2", packId: "other-pack", ability: 1450 },
    ],
    cardDifficulties: [
      { cardId: "S1:object", difficulty: 1600, answerCount: 4 },
      { cardId: "S2:object", difficulty: 1400, answerCount: 2 },
    ],
    feedback: FEEDBACK,
  });
  return createAdminApp({ pack: fixtureReadStorePack(), readStore });
}

describe("GET /users", () => {
  it("lists every user through the read store", async () => {
    const res = await buildApp().request("/users");
    expect(res.status).toBe(200);
    expect(adminUserListSchema.parse(await res.json())).toEqual(USERS);
  });

  it("500s when no read store is configured", async () => {
    const res = await createAdminApp({ pack: fixtureReadStorePack() }).request("/users");
    expect(res.status).toBe(500);
  });
});

describe("GET /users/:userId", () => {
  it("serves a user's detail: abilities, aggregate, recent answers, trajectory", async () => {
    const res = await buildApp().request("/users/u1");
    expect(res.status).toBe(200);
    const body = adminUserDetailSchema.parse(await res.json());
    expect(body.user).toEqual(USERS[0]);
    expect(body.abilities).toEqual([{ packId: "test-pack", packLabel: "Test Pack", ability: 1550 }]);
    expect(body.aggregate.totalAnswers).toBe(1);
    expect(body.recentAnswers).toHaveLength(1);
  });

  it("404s an unknown user id", async () => {
    const res = await buildApp().request("/users/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("GET /population", () => {
  it("serves the all-users aggregate view", async () => {
    const res = await buildApp().request("/population");
    expect(res.status).toBe(200);
    const body = adminPopulationSchema.parse(await res.json());
    expect(body.totalUsers).toBe(2);
    expect(body.totalAnswers).toBe(2);
  });
});

describe("GET /results", () => {
  it("lists every answer across users, unfiltered", async () => {
    const res = await buildApp().request("/results");
    expect(res.status).toBe(200);
    const body = adminResultsResponseSchema.parse(await res.json());
    expect(body.total).toBe(2);
  });

  it("applies query filters, and counts recompute to match", async () => {
    const res = await buildApp().request("/results?userId=u1");
    const body = adminResultsResponseSchema.parse(await res.json());
    expect(body.total).toBe(1);
    expect(body.accuracy).toBe(1);
    expect(body.rows[0]?.userId).toBe("u1");
  });

  it("applies a correct=false filter (string-coerced from the query)", async () => {
    const res = await buildApp().request("/results?correct=false");
    const body = adminResultsResponseSchema.parse(await res.json());
    expect(body.total).toBe(1);
    expect(body.rows[0]?.userId).toBe("u2");
  });
});

describe("GET /results/charts", () => {
  it("serves charts, leaderboard, and hardest/easiest Cards", async () => {
    const res = await buildApp().request("/results/charts");
    expect(res.status).toBe(200);
    const body = adminResultsChartsSchema.parse(await res.json());
    expect(body.hardestCards[0]?.cardId).toBe("S1:object");
    expect(body.easiestCards[0]?.cardId).toBe("S2:object");
    expect(body.leaderboard.byAbility.length).toBeGreaterThan(0);
  });

  it("honors the same filters as /results", async () => {
    const res = await buildApp().request("/results/charts?userId=u1");
    const body = adminResultsChartsSchema.parse(await res.json());
    expect(body.accuracyOverTime.every((p) => p.count <= 1)).toBe(true);
  });
});

describe("GET /feedback", () => {
  it("lists every report newest-first with the submitter's email resolved", async () => {
    const res = await buildApp().request("/feedback");
    expect(res.status).toBe(200);
    const body = adminFeedbackListSchema.parse(await res.json());
    expect(body.map((r) => r.id)).toEqual([3, 2, 1]);
    expect(body[2]?.userEmail).toBe("a@example.com");
    expect(body[0]?.context?.acceptedAnswers).toEqual(["Tokyo"]);
  });

  it("filters by status", async () => {
    const res = await buildApp().request("/feedback?status=resolved");
    const body = adminFeedbackListSchema.parse(await res.json());
    expect(body.map((r) => r.id)).toEqual([1]);
  });

  it("filters by kind", async () => {
    const res = await buildApp().request("/feedback?kind=question");
    const body = adminFeedbackListSchema.parse(await res.json());
    expect(body.map((r) => r.id)).toEqual([3, 2]);
  });

  it("500s when no read store is configured", async () => {
    const res = await createAdminApp({ pack: fixtureReadStorePack() }).request("/feedback");
    expect(res.status).toBe(500);
  });
});
