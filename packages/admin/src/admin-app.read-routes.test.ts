import { describe, expect, it } from "vitest";
import {
  adminPopulationSchema,
  adminResultsChartsSchema,
  adminResultsResponseSchema,
  adminUserDetailSchema,
  adminUserListSchema,
} from "@geo/contract";
import { createAdminApp } from "./admin-app.js";
import { createInMemoryReadStore, type AdminAnswerRow, type AdminUser } from "./read-store.js";
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

// `readStores` is a map now (#172), keyed by Environment; `buildApp()` seeds
// only `prod`, since every pre-existing test below never sends `?env=` and
// must keep exercising exactly today's behavior (absent env => prod).
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
  });
  return createAdminApp({ pack: fixtureReadStorePack(), readStores: { prod: readStore } });
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

/**
 * The environment plumbing itself (#172): `readStores` is a map of
 * Environment => store, and every cross-user route reads `?env=` to pick
 * which one. This is the assertion that makes the feature real — the same
 * route, with two different environments, must return two different answers,
 * proving the BFF isn't quietly reading one schema for everything.
 */
describe("environment routing", () => {
  const PROD_USERS: AdminUser[] = [
    { id: "prod-u1", email: "prod@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: null },
  ];
  const DEV_USERS: AdminUser[] = [
    { id: "dev-u1", email: "dev1@example.com", createdAt: "2026-08-05T00:00:00.000Z", lastSignInAt: null },
    { id: "dev-u2", email: "dev2@example.com", createdAt: "2026-08-06T00:00:00.000Z", lastSignInAt: null },
  ];

  function buildTwoEnvApp() {
    return createAdminApp({
      pack: fixtureReadStorePack(),
      readStores: {
        prod: createInMemoryReadStore({ users: PROD_USERS }),
        dev: createInMemoryReadStore({ users: DEV_USERS }),
      },
    });
  }

  it("returns different data for different environments on the same route", async () => {
    const app = buildTwoEnvApp();

    const prodRes = await app.request("/users");
    const devRes = await app.request("/users?env=dev");

    expect(adminUserListSchema.parse(await prodRes.json())).toEqual(PROD_USERS);
    expect(adminUserListSchema.parse(await devRes.json())).toEqual(DEV_USERS);
  });

  it("treats an absent env exactly as prod, unmodified from today's behavior", async () => {
    const app = buildTwoEnvApp();
    const noEnv = await app.request("/users");
    const explicitProd = await app.request("/users?env=prod");
    expect(await noEnv.json()).toEqual(await explicitProd.json());
  });

  it("rejects an unrecognized environment as a client error rather than defaulting", async () => {
    const app = buildTwoEnvApp();
    const res = await app.request("/users?env=staging");
    expect(res.status).toBe(400);
  });

  it("fails a route for an environment with no configured store, naming that environment, while other environments still work", async () => {
    const app = buildTwoEnvApp(); // no `test` store configured

    const testRes = await app.request("/users?env=test");
    expect(testRes.status).toBe(500);
    const testBody = (await testRes.json()) as { error?: string };
    expect(testBody.error).toContain("test");

    const devRes = await app.request("/users?env=dev");
    expect(devRes.status).toBe(200);
  });
});
