import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * What the auth middleware adds to the Hono context for every request that gets
 * past it. `userId` is the verified `sub` claim; `supabase` is a client already
 * scoped to that user — its every query runs under the caller's JWT, so Postgres
 * RLS decides which rows it can see (see `supabase-storage.ts`, #51/#57).
 */
export interface AuthEnv {
  Variables: {
    userId: string;
    supabase: SupabaseClient;
  };
}

/**
 * How the middleware resolves the key(s) it verifies signatures against. This is
 * the one seam that would otherwise reach the network: production passes the
 * result of {@link createRemoteJWKSet}, tests pass a locally generated public
 * key. The type matches what `jose`'s `jwtVerify` accepts as its key argument.
 */
export type KeyResolver = Parameters<typeof jwtVerify>[1];

export interface AuthOptions {
  /** Verification key resolver — see {@link KeyResolver}. */
  jwks: KeyResolver;
  /** Supabase project URL, for building the per-request user-scoped client. */
  supabaseUrl: string;
  /**
   * The low-privilege publishable key. The client is built with it, but it is
   * the forwarded user JWT — not this key — that RLS keys on, so the key never
   * grants more than the signed-in user already has.
   */
  supabaseKey: string;
  /** Expected `iss` claim, if it should be checked (e.g. `<url>/auth/v1`). */
  issuer?: string;
  /** Expected `aud` claim; Supabase access tokens carry `authenticated`. */
  audience?: string;
  /**
   * Postgres schema the user client reads/writes (the `DB_SCHEMA` wrangler var).
   * Isolates data per environment on one project: dev→`dev`, test→`test`, and
   * prod left unset so it keeps the Supabase default (`public`). RLS still keys
   * on the shared `auth.uid()`, so this only changes which tables are hit.
   */
  schema?: string;
}

/**
 * Verifies the Supabase access token on `Authorization: Bearer <jwt>` and, on
 * success, hands downstream handlers the caller's id and a user-scoped Supabase
 * client. Anything short of a valid, unexpired, correctly signed token with a
 * subject is a 401 — the safe default, matching RLS's own "no `auth.uid()`, no
 * rows" behaviour.
 *
 * Verification is local (ES256 against the public JWKS), so there is no
 * per-request round-trip to Supabase Auth. WebCrypto-only, so it bundles for a
 * Cloudflare Worker.
 */
export function createAuthMiddleware({ jwks, supabaseUrl, supabaseKey, issuer, audience, schema }: AuthOptions) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
    if (!token) {
      throw new HTTPException(401, { message: "missing bearer token" });
    }

    let sub: string | undefined;
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience });
      sub = payload.sub;
    } catch (err) {
      throw new HTTPException(401, { message: "invalid token", cause: err });
    }
    if (!sub) {
      throw new HTTPException(401, { message: "token has no subject" });
    }

    c.set("userId", sub);
    // Constructing a client makes no network call; the forwarded JWT is what
    // scopes it, so every query this request makes runs as `sub` under RLS.
    // A runtime `schema` widens supabase-js's schema generic to `string`; the
    // stored client is typed at the default (`public`), and the queries in
    // supabase-storage.ts don't depend on the generic, so narrow it back here.
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
      // Omit `db` entirely when no schema is set so prod keeps the default
      // (`public`); only dev/test pass an explicit override.
      ...(schema ? { db: { schema } } : {}),
    }) as SupabaseClient;
    c.set("supabase", supabase);

    await next();
  });
}

/**
 * The production key resolver: the project's public JWKS, fetched and cached by
 * `jose`. Kept separate from {@link createAuthMiddleware} so the middleware stays
 * network-free under test.
 */
export function supabaseJwks(supabaseUrl: string): KeyResolver {
  return createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
}
