import { describe, expect, it } from "vitest";
import { adminEnvironmentComparisonSchema, type AdminEnvironmentComparison, type Environment } from "@geo/contract";
import { createAdminApp } from "./admin-app.js";
import { createInMemoryReadStore, type AdminAnswerRow, type AdminUser } from "./read-store.js";
import { fixtureReadStorePack } from "./test-fixtures.js";

/**
 * Route test for the Environments comparison surface (#174), at the same
 * seam as `admin-app.read-routes.test.ts`: `createAdminApp(...)` +
 * `app.request()` in-process, an in-memory fake per environment, response
 * parsed through the contract schema. This route reads all three
 * environments at once and never takes `?env=` — the assertion that matters
 * here is that ONE failing environment (`test`, below, deliberately left
 * unconfigured) never blanks the healthy columns.
 */
const PROD_USERS: AdminUser[] = [
  { id: "u1", email: "a@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: null },
  { id: "u2", email: "b@example.com", createdAt: "2026-08-02T00:00:00.000Z", lastSignInAt: null },
];
const PROD_ANSWERS: AdminAnswerRow[] = [
  { userId: "u1", cardId: "S1:object", input: "Japan", correct: true, askedAt: "2026-08-20T00:00:00.000Z" },
  { userId: "u2", cardId: "S2:object", input: "wrong", correct: false, askedAt: "2026-08-21T00:00:00.000Z" },
];

const DEV_USERS: AdminUser[] = [
  { id: "u1", email: "a@example.com", createdAt: "2026-08-01T00:00:00.000Z", lastSignInAt: null },
  { id: "u2", email: "b@example.com", createdAt: "2026-08-02T00:00:00.000Z", lastSignInAt: null },
];

function buildApp() {
  return createAdminApp({
    pack: fixtureReadStorePack(),
    readStores: {
      prod: createInMemoryReadStore({
        users: PROD_USERS,
        answers: PROD_ANSWERS,
        packAbilities: [{ userId: "u1", packId: "test-pack", ability: 1550 }],
        cardDifficulties: [{ cardId: "S1:object", difficulty: 1600, answerCount: 4 }],
      }),
      dev: createInMemoryReadStore({ users: DEV_USERS }), // no activity in dev yet
      // `test` deliberately has no configured store.
    },
  });
}

/**
 * The comparison is keyed by Environment, so every column read is an optional
 * lookup. These three narrow it once and *throw* when the column is missing or
 * carries the wrong status — deliberately not an `if (status === "ok")` guard,
 * which would let every assertion inside it be skipped silently by a route that
 * regressed to reporting the environment unavailable.
 */
function column(body: AdminEnvironmentComparison, env: Environment) {
  const col = body.environments[env];
  if (!col) throw new Error(`no column for environment ${env}`);
  return col;
}

function okColumn(body: AdminEnvironmentComparison, env: Environment) {
  const col = column(body, env);
  if (col.status !== "ok") throw new Error(`expected ${env} to be ok, got ${col.status}: ${col.reason}`);
  return col;
}

function unavailableColumn(body: AdminEnvironmentComparison, env: Environment) {
  const col = column(body, env);
  if (col.status !== "unavailable") throw new Error(`expected ${env} to be unavailable, got ${col.status}`);
  return col;
}

describe("GET /environments", () => {
  it("returns healthy columns for prod and dev alongside an unavailable test column, naming the reason", async () => {
    const res = await buildApp().request("/environments");
    expect(res.status).toBe(200);
    const body = adminEnvironmentComparisonSchema.parse(await res.json());

    const prod = okColumn(body, "prod");
    expect(prod.usersWithAnswers).toBe(2);
    expect(prod.totalAnswers).toBe(2);
    expect(prod.accuracy).toBe(0.5);
    expect(prod.packsWithAbilityRows).toBe(1);
    expect(prod.ratedCards).toBe(1);

    const dev = okColumn(body, "dev");
    expect(dev.totalAnswers).toBe(0);
    expect(dev.accuracy).toBe(0);

    expect(unavailableColumn(body, "test").reason).toContain("test");
  });

  it("carries the shared registered-user count once, from a healthy environment, not per column", async () => {
    const res = await buildApp().request("/environments");
    const body = adminEnvironmentComparisonSchema.parse(await res.json());
    expect(body.registeredUsers).toBe(2);
  });

  it("ignores a ?env= query — this route always reads every environment", async () => {
    const res = await buildApp().request("/environments?env=dev");
    expect(res.status).toBe(200);
    const body = adminEnvironmentComparisonSchema.parse(await res.json());
    expect(Object.keys(body.environments).sort()).toEqual(["dev", "prod", "test"]);
  });

  it("reports registeredUsers as 0 when every environment is unavailable", async () => {
    const res = await createAdminApp({ pack: fixtureReadStorePack() }).request("/environments");
    expect(res.status).toBe(200);
    const body = adminEnvironmentComparisonSchema.parse(await res.json());
    expect(body.registeredUsers).toBe(0);
    unavailableColumn(body, "prod");
    unavailableColumn(body, "test");
    unavailableColumn(body, "dev");
  });
});
