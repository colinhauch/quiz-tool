import { Hono } from "hono";
import { type CryptoKey, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The per-environment schema wiring: `createAuthMiddleware({ schema })` must
 * build the user-scoped client against that Postgres schema, so dev/test deploys
 * (DB_SCHEMA=dev|test) read and write their OWN tables while prod stays on
 * `public`. supabase-js is mocked here so we can assert the exact `db.schema`
 * option passed to `createClient`, without depending on its internals.
 */
const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn((..._args: unknown[]): unknown => ({})),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

const { createAuthMiddleware } = await import("./auth.js");
type AuthEnv = import("./auth.js").AuthEnv;

describe("auth middleware — per-environment schema", () => {
  let privateKey: CryptoKey;
  let publicKey: CryptoKey;

  beforeAll(async () => {
    ({ privateKey, publicKey } = await generateKeyPair("ES256"));
  });

  async function bearer() {
    const jwt = await new SignJWT({ sub: "user-1", role: "authenticated" })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    return `Bearer ${jwt}`;
  }

  function app(schema?: string) {
    const a = new Hono<AuthEnv>();
    a.use(
      "*",
      createAuthMiddleware({
        jwks: publicKey,
        supabaseUrl: "https://project.supabase.co",
        supabaseKey: "sb_publishable_test",
        schema,
      }),
    );
    a.get("/me", (c) => c.json({ ok: true }));
    return a;
  }

  it("builds the user client against the configured schema", async () => {
    createClientMock.mockClear();
    const res = await app("dev").request("/me", { headers: { Authorization: await bearer() } });
    expect(res.status).toBe(200);
    expect(createClientMock).toHaveBeenCalledTimes(1);
    const options = createClientMock.mock.calls[0]![2] as { db?: { schema?: string } };
    expect(options.db?.schema).toBe("dev");
  });

  it("leaves the schema at the Supabase default (public) when none is configured", async () => {
    createClientMock.mockClear();
    await app().request("/me", { headers: { Authorization: await bearer() } });
    const options = createClientMock.mock.calls[0]![2] as { db?: { schema?: string } };
    expect(options.db?.schema).toBeUndefined();
  });
});
