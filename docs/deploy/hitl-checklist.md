# Deploy MVP — human-only (HITL) checklist

Things an agent **cannot** do over the connected MCPs (Supabase + Cloudflare) and that need Colin at a dashboard, DNS registrar, or Google Cloud console. Tracked against the wayfinder map [#49](https://github.com/colinhauch/quiz-tool/issues/49). Update the checkboxes as you go.

Connected + already done by agent (for reference):
- Supabase project `quiz-tool` (ref `fmxjevgxlnqujsqeqfwt`, `https://fmxjevgxlnqujsqeqfwt.supabase.co`), schema + RLS migrated and proven. Publishable key `sb_publishable_fAoIRUV4B8RRdytsQRPgjw_tGhmvYdo`.

---

## 1. Google OAuth provider (Supabase → Auth → Providers → Google) — issue #53
**Done (2026-08-19).** OAuth client registered in Google Cloud; Google provider
enabled in Supabase. Client secret stored in **Apple Passwords (iCloud)** — not
in the repo. Agent can't register an app in someone else's Google Cloud account.

- [x] In **Google Cloud Console → APIs & Services → Credentials**, create an **OAuth 2.0 Client ID** (type: Web application).
- [x] Authorized redirect URI: `https://fmxjevgxlnqujsqeqfwt.supabase.co/auth/v1/callback`.
- [x] Configure the OAuth consent screen (app name, support email, scopes: `email`, `profile`, `openid`).
- [x] Copy **Client ID** + **Client secret** into Supabase → Authentication → Providers → **Google** → enable.
- [x] Record: client secret in **Apple Passwords (iCloud)**; consent screen in **Testing** mode (fine for alpha).

## 2. Magic-link email (Supabase → Auth) — issue #53
**Done (2026-08-19).** Email provider enabled; SPA redirect URLs added. Branded
HTML templates authored and stored in `docs/deploy/email-templates/` (PR #69) —
paste into the Dashboard when ready; the default template already carries
`{{ .ConfirmationURL }}`, so magic-link login works meanwhile.

- [x] Confirm **Email** provider is enabled and the magic-link template contains `{{ .ConfirmationURL }}` (else Supabase sends a 6-digit OTP instead of a link).
- [x] Add the SPA callback URL to **Auth → URL Configuration → Redirect URLs** (`https://quiz.colinhauch.com/auth/callback`, and `http://localhost:5173/auth/callback` for dev).
- [ ] For real email deliverability beyond the low built-in cap, configure a custom **SMTP** provider (post-alpha; default built-in sender is rate-limited to a few emails/hour — fine for alpha).

## 3. ES256 asymmetric JWT signing keys (Supabase → Auth → Signing Keys) — issue #53
Research #51 recommends asymmetric ES256 over shared-secret HS256 so the Worker
verifies JWTs against the public JWKS with no shared secret.
**Done — the JWKS already serves an `ES256` key** (verified 2026-08-18).

- [x] In **Auth → Signing Keys**, generate/rotate to an **ES256 (P-256)** signing key; make it the current key.
- [x] Confirm the JWKS is served at `https://fmxjevgxlnqujsqeqfwt.supabase.co/auth/v1/.well-known/jwks.json`.
- [x] (No app secret to store — the Worker only needs the public JWKS URL.)

## 4. Cloudflare Worker + DNS — issue #54
**Done (2026-08-12).** The real server runs on the Worker at `quiz.colinhauch.com`
with a valid cert. Verified live: `GET /health` → 200 `{"status":"ok"}`,
`GET /question` → 401 (data routes auth-guarded).

- [x] Cloudflare account has Workers enabled. Account: `Colin.hauch@gmail.com's Account` (`6e9c89b4f9f2c0ef025e4fc6f2159bf6`).
- [x] `wrangler login` done (OAuth, `colin.hauch@gmail.com`).
- [x] `colinhauch.com` is an active Cloudflare zone.
- [x] Custom domain bound: `quiz.colinhauch.com` → `quiz-tool` Worker, via `custom_domain` route in `packages/server/wrangler.toml` (wrangler auto-created DNS + TLS on deploy).
- [x] **Real server ported.** `src/worker.ts` is a `fetch` entry (not `@hono/node-server`); it assembles the build-time pack bundle (`src/packs.generated.ts` from `pnpm bundle-packs`, no `fs`/dynamic import) and serves the same `createApp` with Supabase-backed per-user stores (no SQLite). Compile-time edge server→packs is a deliberate, recorded departure — see [ADR-0001 amendment](../adr/0001-packs-are-discovered-not-compiled-in.md).

## 5. Secrets for the Worker
**Done (verified 2026-08-18).** URL + publishable key are non-secret and live in
`packages/server/wrangler.toml` `[vars]` (publishable key is low-privilege by
design — RLS keys on the forwarded user JWT). No service key is set on the Worker
(`wrangler secret list` → empty), keeping it out of the request path.

- [x] `SUPABASE_URL` = `https://fmxjevgxlnqujsqeqfwt.supabase.co` — in `[vars]`.
- [x] `SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_fAoIRUV4B8RRdytsQRPgjw_tGhmvYdo` (low-privilege; forwards the user JWT for RLS) — in `[vars]`.
- [x] `SUPABASE_SERVICE_KEY` — **intentionally not set** on the Worker. Add via `wrangler secret put` only if a genuine admin/batch path ever needs it; keep out of the request path.

## 6. Local test env (optional, to run the store integration tests fully)
The supabase-js store tests skip unless these are set (they mint a throwaway user via the admin API):
- [ ] `.env` (gitignored) with `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` so `packages/server` integration tests can create/sign-in a test user and exercise real RLS.
</content>
</invoke>
