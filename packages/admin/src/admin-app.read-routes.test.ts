import { describe, expect, it } from "vitest";
import { adminUserListSchema } from "@geo/contract";
import { createAdminApp } from "./admin-app.js";
import { createInMemoryReadStore, type AdminUser } from "./read-store.js";
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

function buildApp() {
  const readStore = createInMemoryReadStore({ users: USERS });
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
