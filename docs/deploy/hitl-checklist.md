# Deploy MVP — human-only (HITL) checklist

Things an agent **cannot** do over the connected MCPs (Supabase + Cloudflare) and that need Colin at a dashboard, DNS registrar, or Google Cloud console. Tracked against the wayfinder map [#49](https://github.com/colinhauch/quiz-tool/issues/49). Update the checkboxes as you go.

Connected + already done by agent (for reference):
- Supabase project `quiz-tool` (ref `fmxjevgxlnqujsqeqfwt`, `https://fmxjevgxlnqujsqeqfwt.supabase.co`), schema + RLS migrated and proven. Publishable key `sb_publishable_fAoIRUV4B8RRdytsQRPgjw_tGhmvYdo`.

---

## 1. Google OAuth provider (Supabase → Auth → Providers → Google) — issue #53
Agent can't register an app in someone else's Google Cloud account.

- [ ] In **Google Cloud Console → APIs & Services → Credentials**, create an **OAuth 2.0 Client ID** (type: Web application).
- [ ] Authorized redirect URI: `https://fmxjevgxlnqujsqeqfwt.supabase.co/auth/v1/callback`.
- [ ] Configure the OAuth consent screen (app name, support email, scopes: `email`, `profile`, `openid`).
- [ ] Copy **Client ID** + **Client secret** into Supabase → Authentication → Providers → **Google** → enable.
- [ ] Record: client ID stored where, consent screen in testing vs published.

## 2. Magic-link email (Supabase → Auth) — issue #53
- [ ] Confirm **Email** provider is enabled and the magic-link template contains `{{ .ConfirmationURL }}` (else Supabase sends a 6-digit OTP instead of a link).
- [ ] Add the SPA callback URL to **Auth → URL Configuration → Redirect URLs** (e.g. `https://quiz.colinhauch.com/auth/callback`, and `http://localhost:5173/auth/callback` for dev).
- [ ] For real email deliverability beyond the low built-in cap, configure a custom **SMTP** provider (post-alpha ok; note the default rate limit for alpha).

## 3. ES256 asymmetric JWT signing keys (Supabase → Auth → Signing Keys) — issue #53
Research #51 recommends asymmetric ES256 over shared-secret HS256 so the Worker verifies JWTs against the public JWKS with no shared secret.

- [ ] In **Auth → Signing Keys**, generate/rotate to an **ES256 (P-256)** signing key; make it the current key.
- [ ] Confirm the JWKS is served at `https://fmxjevgxlnqujsqeqfwt.supabase.co/auth/v1/.well-known/jwks.json`.
- [ ] (No app secret to store — the Worker only needs the public JWKS URL.)

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
- [ ] **Auto-deploy the dev branch → dev env.** In CF Workers Builds (dashboard → Worker → Settings → Builds), map the `dev` branch's build to run `wrangler deploy --env dev` (non-production branch build), or set the build command per branch. Prod branch (main) keeps the plain `wrangler deploy`. The `test` env has no branch trigger — deploy it manually or from CI.
- [ ] **⚠️ Supabase isolation.** All three envs currently point at the **same** Supabase project (the `vars` are duplicated). dev/test writes therefore hit production data. Before real use, give dev and test their own Supabase project (or branch), and update `[env.dev.vars]` / `[env.test.vars]` (and any OAuth redirect URLs in §1–2) accordingly.

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
