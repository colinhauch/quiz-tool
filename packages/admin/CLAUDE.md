# @geo/admin — read-only operator visualizer

A localhost tool for looking into the data quiz-tool manages: **Packs**, **Users**,
**Results**, **Feedback**, **Graph Health**, **Generator Preview**, and **Environments**. A Vite + React SPA plus a
thin local Hono BFF, mirroring `@geo/web` + `@geo/server`. Deployed separately from
the player app and kept out of its bundle. **Read-only — no route writes.** See spec
#133 for the reasoning.

## Launch

```
pnpm admin        # from repo root — BFF (:3101) + SPA (:5273) together
```

Then open `http://localhost:5273`. (`pnpm --filter @geo/admin dev` is the same
thing; `dev:bff` / `dev:spa` run the halves alone.) `scripts/dev.ts` spawns both
and ties their lifecycles together — no `concurrently` dependency.

- **Packs, Graph Health, Generator Preview** read the assembled pack graph and
  need **no database** — they work the moment the BFF boots. They are also
  Environment-independent: the local pack graph is the same regardless of
  which Environment is selected.
- **Environments** (#174) reads *every* Environment at once and takes no
  `?env=`; an unreachable one is a single "unavailable" column, never a blank
  page. Every surface that is not scoped to the selected Environment says so
  on the page itself (`EnvironmentNote.tsx`, #173) — including Users, whose
  roster is the shared auth pool while the figures beside it are per-Environment.
- **Users, Results, Population, Feedback** read across all users, in whichever
  Environment is selected in the SPA's left-nav selector (`prod`/`test`/`dev`
  — CONTEXT.md), and need Supabase credentials (below); without them those
  routes return a clear 500 for every Environment, the rest of the app is fine.

## Credentials (`.env.local`)

```
cp packages/admin/.env.example packages/admin/.env.local   # then fill it in
```

- The BFF (`src/index.ts`) is the **credential boundary**: only it reads
  `SUPABASE_SERVICE_KEY` (from the git-ignored `.env.local`). The key is **never**
  `VITE_`-prefixed, so Vite cannot inline it into the SPA bundle.
- `SUPABASE_URL` is the same Supabase project the player app uses, and the same
  project every Environment lives in — Environments are schemas within it, not
  separate projects (CONTEXT.md's "Environment"/"schema" entries). The
  `service_role` key comes from the Supabase dashboard (Project Settings → API).
  It bypasses RLS — that is how cross-user reads work, in any Environment's
  schema — so it stays localhost-only.
- The BFF builds one service-role client per Environment from these same two
  values, differing only in the bound schema (`db.schema`); which one a
  request reads is chosen per-request by the SPA's environment selector, not
  by this file. Editing `.env.local` still needs a BFF restart (`tsx watch`
  watches source, not env) — switching Environment does not.

## Architecture

- **`createAdminApp(...)`** (`src/admin-app.ts`) — the Hono builder, mirroring
  `createApp` in `@geo/server`. Dependencies are injected (the assembled `Pack`,
  an optional `readStores` map), so tests drive it in-process via `app.request()`
  with no network — the primary integration seam.
- **`AdminReadStore`** (`src/read-store.ts`) — the single interface every
  cross-user read funnels through (`listUsers`, cross-user answers, `pack_ability`,
  `card_difficulty`, `feedback`). Service-role impl in `src/supabase-read-store.ts`; an
  in-memory fake for route tests. A future internet deploy swaps this one class
  for an RLS-extension impl without touching the SPA or the route contract.
- **Environment** (`prod`/`test`/`dev`, #172) — every cross-user route takes
  it as `?env=` (absent = `prod`); `createAdminApp`'s `readStores` is a map of
  Environment => `AdminReadStore`, one per schema, built by `src/index.ts`.
  The interface itself carries no Environment argument — it's a composition
  concern at the map, so the RLS-extension swap above stays a one-class swap.
  The SPA never threads Environment through props or context: `apiClient.ts`
  is the single choke point that attaches it (reading the persisted choice
  once at module load), and `EnvironmentSelector.tsx` (in the left nav) is
  the only place that writes a new choice, via `environmentPref.ts`. See
  CONTEXT.md's "Environment"/"schema" entries and spec #171/#172.
- **Contract** — admin route schemas live in `@geo/contract`
  (`src/admin.ts`, `src/admin-store.ts`), imported by both SPA and BFF so the seam
  has one source of truth.
- **Static surfaces are pure projections** over the assembled `Pack` via
  `@geo/engine` primitives (`enumerateCards`, `ownerPackId`, `generateQuestion`,
  `replay`). The projection logic (`packProjection`, `healthChecks`,
  `generatorPreviewProjection`, `ownership`, the replay-based trajectory, the
  results/population/leaderboard aggregations, `feedbackProjection`) lives here as pure functions — the
  engine's public surface is not widened with admin concerns. Owner/relation
  attribution reads the pre-merge `LoadedPack[]` from `@geo/server/pack-loader`,
  since the assembled graph merges provenance away.
- **Cross-surface navigation** — `src/navigation.ts` is a tiny module-level
  pub/sub (`focusPacksOn` / `usePacksFocus`); the shell watches it to switch
  surfaces (e.g. Graph Health → the offending Entity on the Packs surface).

## Testing

TDD at the seams (see spec #133's testing decisions):

- Pure projections — unit-tested directly against a small fixture graph / Answer Log.
- BFF routes — via `createAdminApp(...)` + `app.request()`, with an in-memory fake
  `AdminReadStore` and a fixture `Pack`; responses parsed through the `@geo/contract`
  schemas.
- The service-role `AdminReadStore` impl — env-gated integration test
  (`supabase-read-store.test.ts`), skipped when Supabase env is unset, mirroring
  `@geo/server`'s `rls.test.ts` / `supabase-storage.test.ts`.
- SPA components — Testing-Library, behavior only (`fireEvent`, not user-event).

```
pnpm --filter @geo/admin test
```

`DESIGN-REVIEW.md` records the #145 UI/UX pass (what the stylesheet fixes and why).
