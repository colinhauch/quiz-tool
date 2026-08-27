import { describe, expect, it } from "vitest";
import { adminUserDetailSchema, adminUserListSchema } from "@geo/contract";
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

function buildApp() {
  const readStore = createInMemoryReadStore({
    users: USERS,
    answers: ANSWERS,
    packAbilities: [
      { userId: "u1", packId: "test-pack", ability: 1550 },
      { userId: "u2", packId: "other-pack", ability: 1450 },
    ],
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
