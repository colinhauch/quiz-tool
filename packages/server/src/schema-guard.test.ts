import { describe, expect, it } from "vitest";

import { resolveSchema } from "./schema-guard.js";

describe("resolveSchema", () => {
  it("maps each deploy env to its committed schema", () => {
    expect(resolveSchema({ DEPLOY_ENV: "prod", DB_SCHEMA: "public" })).toBe("public");
    expect(resolveSchema({ DEPLOY_ENV: "dev", DB_SCHEMA: "dev" })).toBe("dev");
    expect(resolveSchema({ DEPLOY_ENV: "test", DB_SCHEMA: "test" })).toBe("test");
  });

  it("treats an unset DB_SCHEMA as the default public schema", () => {
    expect(resolveSchema({ DEPLOY_ENV: "prod" })).toBe("public");
  });

  it("throws when a stray secret overrides DB_SCHEMA away from the committed env", () => {
    // The prod-outage bug: DEPLOY_ENV stays "prod" (committed var) but a
    // Cloudflare secret flips DB_SCHEMA to "dev". Fail loudly, don't serve.
    expect(() => resolveSchema({ DEPLOY_ENV: "prod", DB_SCHEMA: "dev" })).toThrow(/schema guard/i);
  });

  it("throws on an unknown DEPLOY_ENV", () => {
    expect(() => resolveSchema({ DEPLOY_ENV: "staging", DB_SCHEMA: "staging" })).toThrow(/unknown DEPLOY_ENV/i);
  });

  it("falls back to the effective schema when DEPLOY_ENV is absent (no guard)", () => {
    // Legacy/preview deploys with no DEPLOY_ENV var still resolve, unguarded.
    expect(resolveSchema({ DB_SCHEMA: "dev" })).toBe("dev");
    expect(resolveSchema({})).toBe("public");
  });
});
