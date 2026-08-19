# Accounts & Authentication

> **[UNREVIEWED]** — agent-drafted from the Supabase auth docs (2026-08-18) and the code that already exists on `main` (`packages/server/src/auth.ts`, `supabase-storage.ts`). The *decisions already in code* are trustworthy — read them there. What needs a human's eyes is the **forward-looking half**: the sign-in flow choice (implicit vs. PKCE), whether magic-link ships in the first cut, and the anonymous-upgrade open question. None of the frontend has been built.

Who the learner is, how we know it's them, and where that boundary lives.

## Why accounts, and why now

The engine's whole point is to track one person's knowledge over time — the answer log is a longitudinal record, and the region × relation accuracy screen is only meaningful *per learner*. The MVP faked this with a single hardcoded local user (see [../deployment/](../deployment/)). The moment the app runs as a hosted Worker at a public URL, "one user on one device" stops being true, and every answer needs an owner. Accounts are the seam that turns a shared endpoint back into one private answer log per person.

The **vocabulary**: the person is the *learner* (see `CONTEXT.md`). Their identity is a **Supabase Auth user**, and its id is the JWT `sub` claim. One learner ↔ one auth user; nothing in the app models a learner independently of the auth user, and `sub` is the only learner identifier the server ever sees.

## What is already built

Most of the *server* half exists on `main` and is worth reading before designing anything new:

- **`packages/server/src/auth.ts`** — a Hono middleware that verifies the `Authorization: Bearer <jwt>` on every request **locally**, against the project's public JWKS (ES256), with no per-request round-trip to Supabase Auth. On success it hands the handler the `userId` (`sub`) and a Supabase client already scoped to that user's JWT. Anything short of a valid, unexpired, correctly-signed token with a subject is a 401.
- **`packages/server/src/supabase-storage.ts`** — the production stores. They never write ownership: `user_id` columns default to `auth.uid()`, and Postgres RLS forces every read and write to the caller's rows. Isolation lives in the database, not the app.

So the server already knows how to *trust* a token. What's missing is everything that *produces* one and the project that *signs* it.

## What "adding users" still requires

Three pieces, in rough dependency order:

1. **Provision the Supabase project** (issue #53, human-in-the-loop). Create it, pick a region, record the connection/pooler URLs and keys, and enable the auth providers below. **Critically: enable asymmetric JWT signing keys** — the middleware verifies ES256 against the JWKS, which only works once the project is off the legacy HS256 shared secret. New Supabase projects default to asymmetric keys; an older project must "Migrate JWT secret → Rotate keys" on the JWT signing-keys dashboard. Get this wrong and every request 401s with a signature error.
2. **Frontend sign-in.** The React SPA has no auth today (it talks to the API unauthenticated). It needs a `supabase-js` client, a sign-in surface, and the plumbing that attaches the session's access token as the `Bearer` on every API call. This is the bulk of the remaining work.
3. **The DB schema + RLS.** The `answers` and selection tables the stores assume must exist with `user_id uuid default auth.uid()`, RLS enabled, and per-user `to authenticated using (auth.uid() = user_id)` policies (with `with check` on writes). See [../storage/](../storage/) and the Supabase security checklist.

## The sign-in flow

**Providers:** Google OAuth and magic-link email (per #53). Both are passwordless — we never store or verify a password, which removes a whole category of liability. Discord and other socials are explicitly deferred (issues #205/#206).

**The shape.** The SPA is client-only — no SSR, and the Worker is a stateless JSON API, not a page server. So the browser owns the session:

- `supabase.auth.signInWithOAuth({ provider: 'google' })` redirects to Google and back; `supabase.auth.signInWithOtp({ email })` sends a magic link. In both cases `supabase-js` lands the app back with a session and persists it (localStorage by default).
- Every call to our Worker carries `Authorization: Bearer <session.access_token>`. The middleware already described verifies it. The Worker holds **no session** — it re-derives the learner from the token on each request. That is what lets it stay a stateless, edge-deployed API.

**Implicit vs. PKCE is the one real decision here.** The Google guide frames implicit flow as "all you need for a SPA," but `supabase-js` v2 defaults to **PKCE even client-side** (it auto-exchanges the code via `detectSessionInUrl`). PKCE is the more defensible default — access tokens don't sit in the redirect URL fragment. Pin this deliberately when building the client rather than inheriting whichever the first copied snippet used. *(Open — see below.)*

## Why local JWKS verification

The middleware verifies signatures offline against the public JWKS instead of calling Supabase Auth to introspect each token. Two reasons, and they compound:

- **The Worker runs at the edge.** A network round-trip to Auth on every request would add latency to the request's critical path and couple our availability to theirs. Local verification is a WebCrypto operation on data we already hold.
- **Asymmetric keys make it safe.** With ES256 the verifier only ever holds the *public* key; the signing secret never leaves Supabase. This is the entire reason the project must be on asymmetric signing keys (piece #1) — the design doesn't work on the legacy HS256 shared secret without handing the Worker a secret it shouldn't have.

The cost is staleness: `jose` and Supabase's edge cache the JWKS (~20 min), so a *revoked signing key* keeps verifying briefly. Acceptable — access-token lifetimes are short and key revocation is rare. **Note this is signing-key staleness, not session revocation:** deleting a user or signing them out does **not** invalidate an already-issued access token until it expires. If we ever need hard, immediate revocation on sensitive actions, that's a session-id check against `auth.sessions`, not something local verification gives us for free.

## Why the database owns isolation

Per-user separation is an RLS predicate, not an application `where user_id = ?`. The app code in `supabase-storage.ts` deliberately can't see another user's rows even if it tried — the client is scoped to the caller's JWT and Postgres enforces the boundary. This means a bug in a query, a forgotten filter, or a future new store *cannot* leak across learners: the worst case is the caller sees their own rows or none. Ownership is likewise unforgeable — `user_id` defaults to `auth.uid()` and the `with check` pins it, so a client can't insert rows as someone else. Authorization data must live in `app_metadata`, never `user_metadata` (user-editable → trivially spoofable in a policy).

## Rejected / deferred

- **Server-side session cookies (PKCE-with-`@supabase/ssr`).** That's the right shape for a Next.js-style app that renders pages. We don't render pages — the Worker is a JSON API and the frontend is a static SPA. A cookie-based server session would put session state on the stateless side of the system. Rejected on architecture, not preference.
- **Token introspection per request.** Rejected for the latency/coupling reasons above.
- **Passwords.** Not rejected forever, but there's no reason to take on credential storage when both launch providers are passwordless.

## Open questions

- **Implicit vs. PKCE** for the SPA sign-in — decide and pin when building the client (above).
- **Anonymous → account upgrade.** Supabase supports anonymous sign-ins. Do we let a learner accrue an answer log before signing in and then claim it, or is sign-in a hard gate before the first question? This changes the onboarding and the RLS story (anonymous users carry the `authenticated` role — see the `auth.role()` trap). Undecided; blocks the first-run UX.
- **Where the session lives.** localStorage is the `supabase-js` default and is fine for a low-stakes learning app; revisit only if we ever hold anything sensitive.
