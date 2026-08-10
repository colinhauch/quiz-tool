import { Hono } from "hono";
import { type CryptoKey, generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { type AuthEnv, createAuthMiddleware } from "./auth.js";

/**
 * The middleware is exercised through a real Hono app driven by `app.request()`
 * — the same in-process seam the rest of the server is tested at. The one part
 * that would otherwise reach the network, key resolution, is injected: tests
 * sign tokens with a locally generated ES256 keypair and hand the middleware the
 * matching public key, exactly where production passes `createRemoteJWKSet`.
 */
describe("auth middleware", () => {
  let privateKey: CryptoKey;
  let publicKey: CryptoKey;

  beforeAll(async () => {
    ({ privateKey, publicKey } = await generateKeyPair("ES256"));
  });

  /** A minimal protected app: everything behind the middleware, one echo route. */
  function protectedApp() {
    const app = new Hono<AuthEnv>();
    app.use(
      "*",
      createAuthMiddleware({
        jwks: publicKey,
        supabaseUrl: "https://project.supabase.co",
        supabaseKey: "sb_publishable_test",
      }),
    );
    app.get("/me", (c) => c.json({ userId: c.get("userId") }));
    return app;
  }

  /** Signs an ES256 access token shaped like Supabase's, overridable per test. */
  async function accessToken(
    claims: Record<string, unknown>,
    { key = privateKey, expiresIn = "5m" }: { key?: CryptoKey; expiresIn?: string } = {},
  ) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256" })
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(key);
  }

  it("rejects a request with no Authorization header", async () => {
    const res = await protectedApp().request("/me");
    expect(res.status).toBe(401);
  });

  it("rejects an Authorization header that is not a bearer token", async () => {
    const res = await protectedApp().request("/me", {
      headers: { Authorization: "Basic dXNlcjpwYXNz" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a malformed bearer token", async () => {
    const res = await protectedApp().request("/me", {
      headers: { Authorization: "Bearer not.a.jwt" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a token signed by a key the middleware does not trust", async () => {
    const { privateKey: foreignKey } = await generateKeyPair("ES256");
    const token = await accessToken({ sub: "user-1" }, { key: foreignKey });
    const res = await protectedApp().request("/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ sub: "user-1" })
      .setProtectedHeader({ alg: "ES256" })
      .setIssuedAt(now - 3600)
      .setExpirationTime(now - 1800)
      .sign(privateKey);
    const res = await protectedApp().request("/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a valid signature carrying no subject", async () => {
    const token = await accessToken({ role: "authenticated" });
    const res = await protectedApp().request("/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("accepts a valid token and exposes its subject to downstream handlers", async () => {
    const token = await accessToken({ sub: "user-42", role: "authenticated" });
    const res = await protectedApp().request("/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: "user-42" });
  });
});
