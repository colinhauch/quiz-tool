# Handoff — Deploy geo-quiz MVP to quiz.colinhauch.com (alpha)

Written 2026-08-10. Continues the wayfinder map [#49](https://github.com/colinhauch/quiz-tool/issues/49). Repo: `/Users/colinhauch/Code/quiz-tool`, branch `main` (clean — the multi-user server layer just merged; see below).

## Don't re-derive — read these first
- **Memory** `deploy-alpha-wayfinder-map.md` (project memory dir) — the full running decision log, updated through the JWT-middleware + per-user-queue work. Start here.
- **Research** (unmerged, on branch `research/51-supabase-auth-workers`): `docs/research/worker-supabase-postgres.md` (#50), `docs/research/supabase-auth-workers-rls.md` (#51 — the auth spec, now implemented), `docs/research/packs-on-cloudflare-workers.md` (#52 — the spec for the next task, #4).
- **HITL checklist** `docs/deploy/hitl-checklist.md` — everything that can't be done via MCP. This is the critical path now.
- Issues: [#53](https://github.com/colinhauch/quiz-tool/issues/53) Supabase provision (HITL), [#54](https://github.com/colinhauch/quiz-tool/issues/54) CF/DNS (HITL), [#55](https://github.com/colinhauch/quiz-tool/issues/55) multi-user model decision, [#56](https://github.com/colinhauch/quiz-tool/issues/56) pack-shipping decision, [#57](https://github.com/colinhauch/quiz-tool/issues/57) storage-design decision, [#59](https://github.com/colinhauch/quiz-tool/issues/59) per-user queue (**CLOSED** by PR #60).

## Locked decisions (do not re-litigate)
- One Cloudflare Worker serves static React + Hono API → Supabase (Postgres + Auth + RLS). Multi-user, isolated per-user progress. Google OAuth + magic link.
- **Data path = supabase-js + forwarded user JWT + RLS** (Colin's call; overrides #50's stale single-user Hyperdrive rec).
- **Auth verification = jose (ES256, local JWKS), not `@supabase/server`** — jose slots in as a plain Hono middleware and lets the user-scoped client be built explicitly. Settled and implemented.
- Packs → Vite `@cloudflare/vite-plugin` + `import.meta.glob(eager)` (#52), **not yet done** — this is the next task.

## State of the code (on `main`, PR #60 merged)
The whole app-layer multi-user unit is merged. Done and verified (88 server tests green, 2 integration skipped; `tsc -b` clean):
- **Supabase `quiz-tool`** provisioned (ref/URL/publishable key in the HITL checklist). Multi-user schema + RLS + `set_pack_selection` RPC applied and proven (SQL impersonation + env-gated integration test).
- **Async store rewrite (#57 work):** async interfaces; sqlite kept for local dev; `supabase-storage.ts` is the production path (no `better-sqlite3`, Worker-bundleable). `user_id` never written by store code (column default `auth.uid()` + RLS with-check).
- **JWT auth middleware:** `packages/server/src/auth.ts` — `createAuthMiddleware({ jwks, supabaseUrl, supabaseKey, issuer?, audience? })` verifies ES256 `Authorization: Bearer` locally, 401s on any failure, sets `c.get("userId")` (sub) + `c.get("supabase")` (client with forwarded JWT so RLS scopes it). `supabaseJwks(url)` = prod `createRemoteJWKSet` helper. Key resolver injected → tested network-free with a locally-signed token.
- **Per-user stores + queue:** `createApp` has a **multi-user mode** — pass `auth` + `storesForUser: (client, userId) => { store, selection? }` and the data routes are guarded, stores built per-request from the caller's client, queue keyed by userId (`Map<key, Queue>`). `/health` stays public. **Single-user mode unchanged** (inject sqlite store → one shared queue); `index.ts` (local Node dev) still uses it. createApp now requires exactly one mode.
- jose@6.2.8 added to server deps.

## Next task — #4 pack-loader glob rewrite (start here)
Per `docs/research/packs-on-cloudflare-workers.md` (#52). Workers have no runtime `import()`, no glob, ephemeral fs — the current `pack-loader.ts` (see the `pack-loading-runtime-only` memory) resolves packs via `import.meta.url` + dynamic `import`, which breaks in a Worker bundle.
1. Adopt Vite + `@cloudflare/vite-plugin`; replace the two fs/`import()` seams with `import.meta.glob(..., { eager: true })` so packs compile in at build time.
2. Keep the loader's public contract (the assembled `Pack`/graph) identical so `createApp` and every pack test are untouched.
3. TDD: Colin wants red-green (`/tdd`).

Then remaining (not yet filed as issues — session checklist): **#5 SPA auth** (Google + magic link, store session, send `Authorization: Bearer` on API calls) → **#6 Worker entry** (`app.fetch` + static assets; wire multi-user `createApp` with `supabaseJwks(url)` + a `storesForUser` that builds the supabase stores; secrets via `wrangler secret put`).

## Blocked on Colin (HITL — cannot be done via MCP)
See `docs/deploy/hitl-checklist.md`. None blocks #4. Blocks #5/#6 real integration:
- **Enable ES256 signing keys** (§3) — the middleware verifies against these.
- **Google OAuth app** + **magic-link template** (§1/§2).
- Long pole: **colinhauch.com DNS onto Cloudflare** + Worker + custom-domain bind (#54, §4).
- Optional: gitignored `.env` with `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` to run the store integration tests fully (§6).

## Environment notes
- Supabase + Cloudflare MCP tools were connected last session; a fresh session may need them re-enabled. `.mcp.json` (committed) wires the Supabase MCP.
- Publishable key + project URL are in `docs/deploy/hitl-checklist.md` (publishable = low-privilege, safe). Service/secret key is NOT in the session — integration tests skip until Colin sets a gitignored `.env`.
- pnpm workspace, Node >=24. Server tests: `pnpm --filter @geo/server test`. Typecheck: `npx tsc -b packages/server`.
- **Worktree gotcha:** a git worktree needs its own `pnpm install` — a bare `pnpm add` leaves node_modules incomplete (zod missing → false `tsc` error cascade). Always full-install after entering a worktree.

## Task tracker (deploy build steps)
schema+RLS ✅ · async stores ✅ · JWT middleware ✅ · per-user queue/stores ✅ (#59, PR #60) · **#4 pack-loader glob (next)** · #5 SPA auth · #6 Worker deploy.

## Suggested skills for the next agent
- **`tdd`** — Colin's stated preference for the pack-loader rewrite (#4), red-green.
- **`supabase`** / **`supabase-postgres-best-practices`** — before any further schema/RLS/auth work.
- **`commit`** — Conventional Commits; repo convention.
- Research for #50/#51/#52 is already done — don't redo it.
