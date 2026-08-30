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
- [x] **Full app on one Worker.** The React SPA ships as static assets from the same Worker, so UI + API share one origin. `wrangler.toml` `[assets]` points at `../web/dist` with `not_found_handling = "single-page-application"` (client routes like `/auth/callback` fall back to `index.html`) and `run_worker_first = ["/api/*", "/health"]` (only those reach the Worker; everything else is asset-first). The `[build]` command runs `pnpm bundle-packs && pnpm --filter @geo/web build`, so a deploy can never ship a stale graph or stale UI. The UI calls `/api/*`; `worker.ts` strips the `/api` prefix to match the root-mounted Hono routes — the same rewrite the Vite dev proxy does. (`bundle-packs` writes `src/packs.generated.ts` only when it changed, so `wrangler dev`'s watcher doesn't loop.)

### 4a. Environments (dev + test)
The same Worker deploys as three isolated instances, defined in `wrangler.toml`:

| Env | Command | Worker | Domain |
| --- | --- | --- | --- |
| production (default) | `wrangler deploy` | `quiz-tool` | `quiz.colinhauch.com` |
| dev | `wrangler deploy --env dev` | `quiz-tool-dev` | `quiz-dev.colinhauch.com` |
| test | `wrangler deploy --env test` | `quiz-tool-test` | `quiz-test.colinhauch.com` |

`assets`, `build`, `compatibility_*`, and `[observability]` are inheritable (shared by all envs); `vars` and `routes` are non-inheritable and are repeated per env. `custom_domain` routes auto-create DNS + TLS on first deploy — so the two new subdomains provision themselves the first time each env is deployed. All three validated via `wrangler deploy --env <e> --dry-run`.

Remaining human steps:
- [ ] **First deploy of each env** (creates the Worker + subdomain): `pnpm --filter @geo/server exec wrangler deploy --env dev` and `… --env test`. Needs `wrangler login` / `CLOUDFLARE_API_TOKEN`.
- [ ] **Auto-deploy dev + test by branch.** Workers Builds gives this Worker only two triggers: the **production branch** (currently `prod` → runs the Deploy command `pnpm --filter @geo/server run deploy` = `wrangler deploy`) and **all other branches** (share one "Non-production branch deploy command", currently `npx wrangler versions upload`). There is no native per-branch→per-env mapping, but `WORKERS_CI_BRANCH` is injected, so one branch-aware script handles both. Wiring (script committed as `@geo/server` `deploy:ci`, dispatches dev→`--env dev`, test→`--env test`, else→`versions upload`):
  - CF dashboard → Worker `quiz-tool` → **Settings → Build → Build configuration** → set the **Non-production branch deploy command** (the field currently showing `npx wrangler versions upload`) to: `pnpm --filter @geo/server run deploy:ci`. Leave the production Deploy command as is.
  - Ensure **"Builds for non-production branches"** stays checked, and the `dev`/`test` git branches exist and are pushed. The script must be present on each branch (flows down dev→test→prod), so merge it through the pipeline.
  - After that: merge to `dev` auto-deploys `quiz-tool-dev`; push/merge to `test` auto-deploys `quiz-tool-test`; feature branches get preview versions only.
  - Note: production branch is set to `prod` (not `main`) — a `prod` branch must exist for production auto-deploy to fire.
- [ ] **⚠️ Expose the dev/test schemas to PostgREST** (REQUIRED before dev/test work). Supabase isolation is now by **Postgres schema**, not a second project (free plan caps at 2): prod → `public`, dev → `dev`, test → `test`, wired via the `DB_SCHEMA` var in `[env.*.vars]` → `createAuthMiddleware({ schema })`. Migration `20260821000000_env_schemas_dev_test.sql` (already applied to the live project) builds the `dev`/`test` schemas. But supabase-js talks to PostgREST, which only serves schemas on the project's exposed list — until this is done, dev/test API calls fail with `"The schema must be one of the following: public, graphql_public"`:
  - Supabase dashboard → project `fmxjevgxlnqujsqeqfwt` → **Settings → API** → **Exposed schemas**: add `dev` and `test` (keep `public`, `graphql_public`), save. Prod/`public` is unaffected.
  - Verify on a dev deploy: sign in, answer a question, then `select count(*) from dev.answers;` (=1) and `select count(*) from public.answers;` (unchanged).
  - **Auth/users are shared** across all three envs — one `auth.users` per project, unavoidable in a single project. No **failure-domain** isolation either (same Postgres/auth instance); acceptable pre-launch, revisit once prod has real users. The redirect URLs in §1–2 must include the dev/test callback origins (`https://quiz-dev.colinhauch.com/auth/callback`, `…/quiz-test…`).

## 5. Secrets for the Worker (set via `wrangler secret put`, not committed)
> Secrets, like `vars`, are **per-environment**: set them once for the default env and again with `--env dev` / `--env test` (e.g. `wrangler secret put SUPABASE_SERVICE_KEY --env dev`).
- [ ] `SUPABASE_URL` = `https://fmxjevgxlnqujsqeqfwt.supabase.co`
- [ ] `SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_fAoIRUV4B8RRdytsQRPgjw_tGhmvYdo` (low-privilege; forwards the user JWT for RLS)
- [ ] `SUPABASE_SERVICE_KEY` = secret key — **only** if a genuine admin/batch path needs it; keep out of the request path.

## 6. Local test env (optional, to run the store integration tests fully)
The supabase-js store tests skip unless these are set (they mint a throwaway user via the admin API):
- [ ] `.env` (gitignored) with `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` so `packages/server` integration tests can create/sign-in a test user and exercise real RLS.
</content>
</invoke>
