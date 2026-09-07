# Plan: Always-on environment indicator for non-prod

## Context

Deployed dev / test / prod look identical in the browser, so it's easy to act on
the wrong Environment. We're adding a persistent, colorful badge that names the
Environment on every non-prod screen, and shows nothing on prod. The value is
authoritative — sourced from the Worker's `DEPLOY_ENV` (the same var `worker.ts`
and the schema guard already trust), surfaced to the SPA over a new
unauthenticated `GET /api/config`, and fail-safe toward showing (anything not
explicitly `prod` shows a badge).

Spec: `sdlc/features/env-indicator-banner/spec.md` (accepted).
Intent: `sdlc/features/env-indicator-banner/intent.md` (accepted).

## Resume protocol (stop/continue at any checkpoint)

This plan is a sequence of **checkpoints**. Each one is independently
committable and ends **green** (`pnpm -w typecheck` + the named tests pass). A
checkpoint is the equivalent of one ticket: safe to stop after, safe to resume
cold in a fresh session.

**To resume in a new session:** read this file + `spec.md`, then run
`git log --oneline feature/env-indicator-intent` and match commit subjects to
the checkboxes below. Start at the first unchecked checkpoint. Each checkpoint
below states its own done-condition, so you never need the prior session's
memory — only its commits.

Commit subject convention (so the log is greppable):
`feat(env-indicator): <checkpoint N — short name>`.

- [x] **C1** — Contract: `environment`/`config` schema + `normalizeEnvironment`
- [x] **C2** — Server: `GET /api/config` wired from `DEPLOY_ENV`
- [ ] **C3** — Client: badge component mounted on the app shell
- [ ] **C4** — End-to-end verification + PR into `dev`

---

## C1 — Contract (`packages/contract`)

The shared vocabulary layer, home of `healthSchema`. Add the Environment
contract here so server and (future) admin share one definition.

**Files:** `packages/contract/src/index.ts`, `packages/contract/src/index.test.ts`.

- Add `configEnvironmentSchema = z.enum(["prod", "dev", "test", "local", "unknown"])`
  and `export type ConfigEnvironment = z.infer<typeof configEnvironmentSchema>`.
  **Name deviation (decided in C1):** the plan originally called these
  `environmentSchema`/`Environment`, but `./admin-store.ts` already exports
  `environmentSchema`/`Environment` = `z.enum(["prod","test","dev"])` (the admin
  `?env=` selector), re-exported flat via `export *`. A second `Environment`
  would shadow it and widen admin's exhaustive records to 5 members (typecheck
  break). Spec also says `local`/`unknown` are "not a fourth Environment", so the
  badge's superset gets its own name rather than reusing `Environment`.
- Add `configSchema = z.object({ environment: configEnvironmentSchema })` and
  `export type Config = z.infer<typeof configSchema>` (mirrors `healthSchema` /
  `Health` exactly — reuse that shape).
- Add a pure `normalizeEnvironment(raw?: string): ConfigEnvironment` — exact
  match on the enum, everything else (including `undefined`) → `"unknown"`. This
  is the fail-safe rule in one testable place.

**Tests (prior art: `index.test.ts` health cases):**
- `normalizeEnvironment("dev") === "dev"`, same for test/prod/local.
- `normalizeEnvironment("staging") === "unknown"`, `normalizeEnvironment(undefined) === "unknown"`.
- `configSchema.parse({ environment: "dev" })` round-trips; a bad environment `safeParse` fails.

**Green:** `pnpm --filter @geo/contract test` + `pnpm -w typecheck`.

## C2 — Server route (`packages/server`)

Expose the Environment at an unauthenticated endpoint, sourced from `DEPLOY_ENV`.

**Files:** `packages/server/src/app.ts`, `packages/server/src/worker.ts`,
`packages/server/src/index.ts`, `packages/server/src/app.test.ts`.

- `AppOptions` (app.ts:54) gains `deployEnv?: string`. Destructure it in
  `createApp` (app.ts:147).
- Register the route **before** the auth middleware, right beside `/health`
  (app.ts:279) so it stays public:
  `app.get("/config", (c) => c.json(configSchema.parse({ environment: normalizeEnvironment(deployEnv) })))`.
  Import `configSchema` + `normalizeEnvironment` from `@geo/contract`.
- `worker.ts` `getApp` (worker.ts:56): pass `deployEnv: env.DEPLOY_ENV`. `Env`
  already declares `DEPLOY_ENV?` (worker.ts:44) — no wrangler change; all three
  environments already set the var.
- `index.ts` (Node entry, the local counterpart): pass
  `deployEnv: process.env.DEPLOY_ENV ?? "local"` so local dev is labeled `local`
  yet still overridable for testing another Environment locally.

**Tests (prior art: `app.test.ts` `/health` test at line ~107,
`createApp({...}).request("/health")`):**
- `createApp({ deployEnv: "dev", ... }).request("/config")` → 200, `{ environment: "dev" }`; same for `test`, `prod`.
- `deployEnv` omitted → `{ environment: "unknown" }`.
- `deployEnv: "staging"` → `{ environment: "unknown" }`.
- `/config` returns 200 with **no** auth header (proves it's public, i.e. above the middleware).

**Green:** `pnpm --filter @geo/server test` + `pnpm -w typecheck`.

**Done (C2):** implemented per plan. Route registered at app.ts (public, beside
`/health`, above the auth `app.use`); `deployEnv?` added to `AppOptions` and
destructured; `worker.ts` passes `env.DEPLOY_ENV`; `index.ts` passes
`process.env.DEPLOY_ENV ?? "local"`. Imports are `configSchema` +
`normalizeEnvironment` (the C1 names). Green: `pnpm --filter @geo/server test`
= 161 passed / 14 skipped; `pnpm -w typecheck` clean.
**Deviation (minor):** the "public with no auth header" case was folded into the
existing multi-user test `leaves /health and /config public but guards the data
routes` (asserts `/config` → 200 while `/question`/`/packs` → 401) rather than a
standalone test — that multi-user app is the only one with the auth middleware
mounted, so it's the meaningful place to prove `/config` sits above it. The
single-user matrix (dev/test/prod, unset→unknown, staging→unknown) lives in a new
`describe("GET /config")`.

## C3 — Client badge (`packages/web`)

Fetch the config and render a badge unless prod. Mount above every `App` branch.

**Files:** `packages/web/src/apiClient.ts`, new
`packages/web/src/EnvironmentBadge.tsx` + `.test.tsx`, new
`packages/web/src/environmentBadge.ts` (pure map) + `.test.ts`,
`packages/web/src/main.tsx`, `packages/web/src/index.css`.

- `apiClient.ts`: add `getConfig(): Promise<Config>` calling `/api/config` via
  the existing `apiFetch` choke point (attaches a Bearer if present, harmless on
  a public route). Import `Config` from `@geo/contract`.
- `environmentBadge.ts`: pure `badgeFor(env: ConfigEnvironment): { label: string; variant: string } | null`
  (`ConfigEnvironment` from `@geo/contract` — see the C1 name-deviation note)
  — returns `null` **only** for `"prod"`; each of dev/test/local/unknown gets a
  distinct `variant` (→ color) and a readable text `label` (name shown as text,
  never color-only — requirement 3/7).
- `EnvironmentBadge.tsx`: on mount, `getConfig()`; hold `environment` in state
  (start `unknown` so the fail-safe badge shows until resolved, and **stays**
  `unknown` on a rejected fetch — requirement 6). Render `badgeFor(env)`; render
  nothing when it's `null`. Presentational, fixed-position, `aria-label` naming
  the Environment; must not cover the app's controls (requirement 8).
- `main.tsx`: render `<EnvironmentBadge />` as a sibling **before** `<App />`, so
  it shows in the signed-out gate, the auth callback, and the signed-in app
  alike (App.tsx returns early for the first two).
- `index.css`: badge + per-variant color styles (colors chosen here; dev vs test
  clearly distinct). Fixed corner placement, high contrast, non-blocking.

**Tests (prior art: `Feedback.test.tsx` / `AuthWidget.test.tsx`, RTL + jsdom):**
- `environmentBadge.test.ts`: `badgeFor("prod") === null`; dev/test/local/unknown each return a descriptor with the expected label; dev and test variants differ.
- `EnvironmentBadge.test.tsx`: mock `getConfig`→`dev` renders the dev label; →`prod` renders nothing; a rejected `getConfig` renders the `unknown` badge.

**Green:** `pnpm --filter @geo/web test` + `pnpm -w typecheck`.

## C4 — End-to-end verification + PR

- Run the app locally and confirm a badge labeled `local` appears; hit
  `/api/config` and confirm `{ environment: "local" }`.
- Sanity-run the built server with `DEPLOY_ENV=test` (or a unit-level assertion)
  to confirm the `test` badge/colour path.
- Confirm the signed-out gate also shows the badge (mount point check).
- Full gate: `pnpm -w typecheck && pnpm -w test` (mirrors the `checks` CI job).
- Set `spec.md`/`plan.md` statuses as done; open a PR `feature/env-indicator-intent` → `dev`.

---

## Verification (whole feature)

1. `pnpm -w typecheck && pnpm -w test` — all green (the `checks` gate).
2. Local: `getConfig()` / `curl /api/config` → `{ environment: "local" }`, badge visible, signed-out included.
3. Unit coverage proves the matrix: prod → no badge; dev/test/local/unknown → badge; unset/garbage `DEPLOY_ENV` → `unknown` badge (never silent on a non-prod origin).
4. No wrangler/deploy change needed — `DEPLOY_ENV` already set per environment; after merge, `quiz-dev`/`quiz-test` show their badges, `quiz` (prod) shows none.

## Out of scope

Admin app; proving which git branch/commit is deployed; hostname-based
detection; auth-gating the badge. Exact palette/placement are decided in C3, not
re-litigated later.
