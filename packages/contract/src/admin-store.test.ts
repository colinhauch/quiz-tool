import { describe, expect, it } from "vitest";
import { adminUserListSchema } from "./admin-store.js";

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
