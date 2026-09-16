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

### 4a. Environments (dev + test) — three-connection model (spec #246)
The same Worker deploys as three isolated instances, defined in `wrangler.toml`:

| Env | Command | Worker | Domain | Watched branch |
| --- | --- | --- | --- | --- |
| production (default) | `wrangler deploy` | `quiz-tool` | `quiz.colinhauch.com` | `prod` |
| dev | `wrangler deploy --env dev` | `quiz-tool-dev` | `quiz-dev.colinhauch.com` | `dev` |
| test | `wrangler deploy --env test` | `quiz-tool-test` | `quiz-test.colinhauch.com` | `test` |

`assets`, `build`, `compatibility_*`, and `[observability]` are inheritable (shared by all envs); `vars` and `routes` are non-inheritable and repeated per env. `custom_domain` routes auto-create DNS + TLS on first deploy. `wrangler.toml` stays **one file, byte-identical on `dev`/`test`/`prod`** — env is selected at deploy time via `--env`, never by diverging config per branch (that would conflict on every promotion).

> **⚠️ Cloudflare mechanic — the whole reason this section exists.** A `custom_domain` is **globally unique per zone**: it attaches to exactly one Worker, and `wrangler deploy` **moves** it to whatever Worker names it, silently detaching the old Worker. So any build that deploys the *wrong* Worker steals that env's subdomain. Every design choice below exists to make each domain namable **only** by its own environment's deploy.

**Architecture: one Workers Builds connection per Worker**, each watching exactly one long-lived branch, with non-production branch builds **off**. A push to `dev`/`test`/`prod` can then only ever build+deploy its own Worker — there is no code path from a lower env to the prod Worker, so a dispatch slip can't move a subdomain. (Trade-off accepted: **no automatic feature-branch previews** — that path was `versions upload` against the prod Worker, itself part of the risk surface.)

Defense-in-depth in the repo: all three connections invoke `@geo/server` `deploy:ci` (`scripts/deploy-ci.ts`), a thin wrapper over the pure `resolveDeploy()` seam ([`src/deploy-resolver.ts`](../../packages/server/src/deploy-resolver.ts), unit-tested in `deploy-resolver.test.ts`). It strips a leading `refs/heads/`, maps `prod`→bare deploy / `dev`→`--env dev` / `test`→`--env test`, and **REFUSES** anything else (logs `[deploy:ci] REFUSING to deploy: …`, exits 0, touches no Worker). The old `*) wrangler versions upload` fallback against prod is gone. Since each connection only ever fires on its own branch, this is belt-and-suspenders — but it keeps the branch→env mapping version-controlled and fail-closed.

#### Human steps — Cloudflare dashboard (one-time)
Cloudflare account `Colin.hauch@gmail.com's Account` (`6e9c89b4f9f2c0ef025e4fc6f2159bf6`); zone `colinhauch.com`. Workers Builds connections **cannot** be created/edited over MCP — this is dashboard-only.

- [ ] **First deploy of dev + test** (creates each Worker + subdomain), if not already live: `pnpm --filter @geo/server exec wrangler deploy --env dev` then `… --env test`. Needs `wrangler login` / `CLOUDFLARE_API_TOKEN`.
- [ ] **Reconfigure the existing `quiz-tool` connection to prod-only.** CF dashboard → Workers & Pages → **`quiz-tool`** → **Settings → Build**:
  - **Git repository**: `colinhauch/quiz-tool` (already connected).
  - **Production branch** = `prod`. **Deploy command** = `pnpm --filter @geo/server run deploy:ci`.
  - **Turn OFF "Build non-production branches"** (Build configuration → uncheck / disable). This is what stops `quiz-tool` from ever building on a push to `dev`/`test`/a feature branch.
- [ ] **Create a connection for `quiz-tool-dev`.** CF dashboard → **`quiz-tool-dev`** → **Settings → Build → Connect / Set up builds**:
  - **Git repository**: `colinhauch/quiz-tool`.
  - **Production branch** = `dev`. **Deploy command** = `pnpm --filter @geo/server run deploy:ci`.
  - **"Build non-production branches" OFF.**
- [ ] **Create a connection for `quiz-tool-test`.** CF dashboard → **`quiz-tool-test`** → **Settings → Build → Connect / Set up builds**:
  - **Git repository**: `colinhauch/quiz-tool`.
  - **Production branch** = `test`. **Deploy command** = `pnpm --filter @geo/server run deploy:ci`.
  - **"Build non-production branches" OFF.**
- [ ] **Verify the topology** before relying on it: each Worker's Build settings show exactly one watched branch, non-prod builds disabled, deploy command `… run deploy:ci`. Result: push/merge to `dev`→`quiz-tool-dev` only; `test`→`quiz-tool-test` only; `prod`→`quiz-tool` only.

> Note on `deploy:ci` per connection: because each connection is single-branch, `WORKERS_CI_BRANCH` will always be that branch, so the resolver always resolves the matching env. The refusal path only fires if a connection is ever misconfigured to a non-deploy branch — which is exactly when you want it to refuse.

#### Recovery procedure — restore correct subdomain bindings
Run this to fix the corrupted state described in spec #246 (prod Worker holding `quiz-test.colinhauch.com`, dev/test with no domain), or any future recurrence. Human-run from a machine with `wrangler login` / `CLOUDFLARE_API_TOKEN`. Redeploy each env **from its own branch, in order** so each re-asserts its `custom_domain`; because domains are unique, redeploying `test` pulls `quiz-test` back off the prod Worker, and the bare prod deploy reclaims `quiz.colinhauch.com`.

- [ ] `git checkout dev  && pnpm --filter @geo/server exec wrangler deploy --env dev`
- [ ] `git checkout test && pnpm --filter @geo/server exec wrangler deploy --env test`
- [ ] `git checkout prod && pnpm --filter @geo/server exec wrangler deploy`
- [ ] **Verify final bindings** match the table above before closing. In the CF dashboard (Workers & Pages → each Worker → Settings → Domains & Routes) or via `wrangler`:

  | Worker | Must own |
  | --- | --- |
  | `quiz-tool` | `quiz.colinhauch.com` |
  | `quiz-tool-test` | `quiz-test.colinhauch.com` |
  | `quiz-tool-dev` | `quiz-dev.colinhauch.com` |

  Each of `GET https://quiz{,-test,-dev}.colinhauch.com/health` → 200 `{"status":"ok"}`.

> Discipline point: no pipeline change catches a **hand-run bare `wrangler deploy`** against this shared account — it will still move whatever domain the local config names. Don't hand-run bare `wrangler deploy` outside this recovery procedure; let the per-branch connections do deploys.
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
