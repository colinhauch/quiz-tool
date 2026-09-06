# Plan: durable scheduler state via a filtered three-level draw

Status: draft

## Context

Two learner-visible bugs share one root cause: scheduler ("bag-of-bags") state
only ever lives in the server's in-memory `Map`. On a refresh — or any fresh
Cloudflare Worker isolate — the pool refills and already-seen cards return
(refresh-repeat); and a newly selected pack stays invisible for ~200 draws
because `applySelection` adds it to `included` but not to the draw
(only-flag-questions). `spec.md` (accepted) fixes both *by construction* with a
scheduler redesign, not a patch: replace the materialized inner bags with a
**filtered three-level draw** over the live card list, track drawn cards in an
exclusion set, and persist a small per-learner document.

This plan is the build blueprint. Build is TDD. `specs/learning/scheduler.md`
still describes the OLD materialized-bag design and is updated at completion, not
here — treat `spec.md` as the source of truth.

## Target design (the contracts a build must hit)

### Engine state — `Scheduler` becomes a filtered draw (`packages/engine/src/scheduler.ts`)

Redefine the state; **no materialized inner `bags`, no `topBag`**:

```ts
interface Scheduler {
  included: readonly string[];              // pack ids drawn from (never empty)
  tiers: readonly Tier[];                   // difficulty config (unchanged shape)
  packRatio: Readonly<Record<string, number>>; // pack id → marbles; absent ⇒ 1
  difficultyBag: readonly string[];         // tier names remaining this cycle (was topBag)
  packBag: readonly string[];               // pack ids remaining this cycle (new)
  drawn: readonly string[];                 // card ids already drawn (exclusion set)
  current: string | null;                   // held, drawn-but-unanswered card id
}
```

All fields are JSON-safe (arrays/objects/string/null) so the whole value
persists directly. `drawn` is stored as an array; build a `Set` inside the draw
for O(1) exclusion.

Functions (all pure, RNG-injected):

- **`buildScheduler(graph, included, rng?, tiers?, packRatio?): Scheduler`** —
  fresh state. Validate the eligible pool is non-empty (retain the empty-pool
  guard: throw `no eligible cards in packs: …`). Fill `difficultyBag` to the tier
  ratio (reuse existing `fillTopBag`, rename → `fillDifficultyBag`); fill
  `packBag` = for each included pack, `packRatio[p] ?? 1` marbles, shuffled;
  `drawn = []`, `current = null`. **Note the signature change:** `ratings`/
  `learnerId` are dropped — a fresh build no longer bins the pool, so it needs no
  ratings.

- **`drawNext(graph, ratings, learnerId, scheduler, rng?): { card, scheduler }`** —
  the three-level filtered draw. Always draws (does NOT short-circuit on
  `current`; the re-serve guard is server-side). Steps, in a bounded loop:
  1. Pop a difficulty marble `d` (refill `difficultyBag` to ratio when empty).
  2. Pop a pack marble `p` (refill `packBag` from `included`×`packRatio` when empty).
  3. Filter live `eligibleCards(graph, included)` to `pack === p`, `P(success)`
     within tier `d`'s band (difficulty read **live** via `successProbability`),
     and id ∉ `drawn`. Pick one at random.
  4. **Slice refill:** if empty, clear `drawn` ids belonging to that slice
     (pack `p`, live P in tier `d`'s band) and re-filter. If still empty (the
     slice has no cards at all), continue the loop to a new marble pair.
  On a pick: add the card id to `drawn`, set `current` = that id, return
  `{ card, scheduler }`. Bound the loop so every `(tier, pack)` pair is examined
  before concluding empty (a safe upper bound, e.g.
  `(difficultyBag.length + cycleTiers) * (packBag.length + cyclePacks)`); on
  exhaustion throw the same `no eligible cards` error (pool truly empty).
  Adding to `drawn` at draw time (a refinement of the spec's "answering adds to
  drawn" — equivalent for exclusion, and required so the pure draw loop is
  self-excluding and seed-deterministic under test).

- **`applySelection(graph, scheduler, included): Scheduler`** — doubles as the
  restore reconciler. Remove deselected packs' marbles from `packBag`; append
  newly-included packs' marbles (so a just-selected pack is drawable on the very
  next draw — the only-flag fix). Update `included`. Drop from `drawn` (and clear
  `current`) any id whose pack is not included or that no longer resolves in the
  graph (reuse the existing `findCard` try/catch). Leave `difficultyBag`
  untouched (selection changes eligibility, not the difficulty mix).

- **`markAnswered(scheduler, cardId): Scheduler`** (new export) — clear `current`
  (when it equals `cardId`) and ensure `cardId ∈ drawn`. Called by `/answer`.

`eligibleCards`, `assertTiersPartition`, `tierOf`, `successProbability`,
`shuffle` are reused as-is; `binPool` is removed (no materialized bins).

### Server — persist + restore (`packages/server/src/app.ts`)

- Add `scheduler?: SchedulerStore` to `UserStores`, `AppOptions`, and `resolve()`.
- `ensureScheduler` (per-isolate cache is no longer the source of truth):
  on a cache miss, `read()` the `SchedulerStore`. Derive the authoritative
  `included` from the SelectionStore exactly as today.
  - **Restored:** `applySelection(pack, restored, included)` to align bags to the
    authoritative selection and drop stale ids; if the persisted `tiers` differ
    from `DEFAULT_TIERS`, refill `difficultyBag`. Cache it. (No ratings needed —
    difficulty is filtered live.)
  - **Absent:** `buildScheduler(pack, included, rng)`, cache, and `write()` it
    (build-fresh-and-persist).
  - Drop the `freshRatings` fast-path (build no longer loads ratings; `/question`
    already loads ratings at draw time).
- **`GET /question`** — if `scheduler.current !== null`, **re-serve** it (resolve
  the id → `findCard` → `generateQuestion` → `cardStats`) and draw nothing.
  Else `drawNext`, set current, and `await scheduler?.write(state)`. Factor a
  small "render + stats for a card id" helper so both paths share it.
- **`POST /answer`** — now also advances scheduler state. Order (preserve the
  existing "caches never lead the log" order): compute rating update → record
  answer (the log) → persist rating caches → `ensureScheduler` + `markAnswered`
  + `await scheduler?.write(state)`. A scheduler-write failure only risks a rare
  repeat (state is a disposable cache), never the log.
- **`PUT /packs`** — after `applySelection`, `await scheduler?.write(state)`
  (write-through per selection change) in addition to the existing
  `selection.write`.
- Contract unchanged: `/question`, `/packs` (GET/PUT), `/answer` keep shapes;
  `queued` stays `eligibleCards(pack, included).length`.

### Storage — one small document per learner (option A)

- **`packages/server/src/storage.ts`** — add `SchedulerStore { read(): Promise<Scheduler | null>; write(state: Scheduler): Promise<void> }` and
  `createSchedulerStore(db)` (SQLite), mirroring `createSelectionStore`. One-row
  table holding the JSON blob:
  ```sql
  CREATE TABLE IF NOT EXISTS scheduler_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    state TEXT NOT NULL
  )
  ```
  `read` → `JSON.parse(row.state)` or `null`; `write` → upsert id=1 with
  `JSON.stringify(state)` (whole-value overwrite).
- **`packages/server/src/supabase-storage.ts`** — add
  `createSupabaseSchedulerStore(client)`: `read` = `maybeSingle()` on
  `scheduler_state` → `state` (jsonb) or `null`; `write` = `upsert({ state }, { onConflict: "user_id" })`. A single-row upsert is atomic, so no RPC is
  needed (unlike `set_pack_selection`). `user_id` omitted (defaults to
  `auth.uid()`, pinned by RLS).
- **`supabase/migrations/<ts>_scheduler_state.sql`** (new) — mirror
  `pack_ability` exactly: loop over `['public','dev','test']`, idempotent
  (`create table if not exists`, drop-then-create policies), per-`(user)` row
  keyed by `user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade`, `state jsonb not null`; RLS enable+force; select/insert/update
  policies `using/with check (user_id = (select auth.uid()))`; and
  `grant select, insert, update ... to authenticated`.

### Wiring
- `packages/server/src/index.ts` — `createSchedulerStore(db)` into the
  single-user `createApp({ ..., scheduler })`.
- `packages/server/src/worker.ts` — `scheduler: createSupabaseSchedulerStore(client)` in `storesForUser`.

## Files that change
- `packages/engine/src/scheduler.ts`
- `packages/engine/src/scheduler.test.ts`
- `packages/engine/src/index.ts` (export `markAnswered`)
- `packages/server/src/storage.ts`
- `packages/server/src/storage.test.ts`
- `packages/server/src/supabase-storage.ts`
- `packages/server/src/supabase-storage.test.ts`
- `packages/server/src/rls.test.ts`
- `packages/server/src/app.ts`
- `packages/server/src/app.test.ts`
- `packages/server/src/index.ts`
- `packages/server/src/worker.ts`
- `supabase/migrations/<timestamp>_scheduler_state.sql` (new)
- (completion, not this feature's runtime work) `specs/learning/scheduler.md`,
  `CONTEXT.md` — adopt *difficulty bag / pack bag / drawn set*; required before
  "done", done via `domain-modeling`.

## Order of work (TDD — each slice: write the failing tests first, then code to green)

Every slice below writes tests that fail against the current code, then the
implementation that makes them pass. Do not write implementation ahead of its
test. The risk cases from **Risks** are each pinned by a named test, called out
inline as `[risk: …]`.

1. **Engine — tests first (red), then the filtered draw.**
   Rewrite `scheduler.test.ts` to the new **observable-behavior** contract before
   touching `scheduler.ts`; the suite is red (old engine has no `drawn`/
   `current`/`packBag`). Cases:
   - Keep: `eligibleCards` (3), tier-partition refusal, empty-pool refusal.
   - Difficulty ratio holds over a cycle with no within-cycle repeats;
     deterministic under a seeded rng (re-tune the seeded arrays; assert
     ratio/distinctness, never internal state).
   - Pack ratio holds over a pack cycle (analogue of the difficulty-ratio test).
   - Slice refill re-admits drawn cards and re-bins by *live* difficulty
     (write a card, draw its slice dry, re-rate it across a tier line, assert it
     reappears in the new band).
   - `drawNext` sets `current` and a subsequent draw excludes every prior draw;
     `markAnswered(s, id)` clears `current` and keeps `id` in `drawn`.
   - A deselected pack stops immediately; a re-selected pack is drawable on the
     very next draw.
   - `[risk: draw-loop budget]` — empty-slice fallthrough does **not** stall
     (a top bag pointed at a tier/pack with zero cards still returns a real card),
     and a genuinely empty pool throws `no eligible cards`. These two pin both
     ends of the bounded marble-pair budget.
   - **Un-skip** "surfaces a newly included pack within a few cycles at real pool
     sizes" (the committed only-flag repro) — red until `applySelection` appends
     the new pack's marble.
   Then rewrite `scheduler.ts` to the new `Scheduler` shape +
   `buildScheduler`/`drawNext`/`applySelection`/`markAnswered`, and export
   `markAnswered` from `index.ts`, until this slice is green.

2. **SchedulerStore (SQLite) — tests first, then the store.**
   Add `storage.test.ts` cases (red): round-trip a `Scheduler`, `null` on first
   read, whole-value overwrite on rewrite. Then add the `SchedulerStore`
   interface + `createSchedulerStore` to green.

3. **Supabase store + migration + RLS — tests first, then code.**
   Add the `supabase-storage.test.ts` round-trip (skips without creds) and the
   `rls.test.ts` case "user A cannot read/write user B's `scheduler_state`" (red;
   runs against a local `supabase start`). Then add
   `createSupabaseSchedulerStore` and the `<ts>_scheduler_state.sql` migration to
   green.

4. **Server integration — tests first (red), then the handlers + wiring.**
   Write the `app.test.ts` cases before editing `app.ts`:
   - `[risk: idempotent /question]` — two `GET /question` with no `POST /answer`
     between them return the **same** `cardId`; after answering, the next
     `/question` differs. (This is the whole refresh-can't-skip guarantee.)
   - **Reload/resume** — draw several questions **answering each**, then build a
     *fresh* app instance over the *same* injected `SchedulerStore` (cold
     in-memory cache): `GET /question` re-serves the held `current`, and `queued`
     / the drawn history show no refill storm.
   - `[risk: per-draw write cost / write-through]` — inject a counting
     `SchedulerStore` (spy over the in-memory one) and assert it is written once
     per `GET /question` that draws, once per `POST /answer`, and once per
     `PUT /packs`; a re-served `/question` (current held) does not draw and so is
     idempotent.
   - Select all packs → a non-flag pack appears within a few draws; deselect a
     pack → it stops immediately.
   - **Fix the fallout:** update the existing tests that pump `GET /question`
     without `POST /answer` (now idempotent) to interleave `/answer` — the
     "full loop" draw-until-Tokyo, "leaves the answer log readable…", and
     "selection responds to live ratings (#119)" seq loop. Tests that call
     `/question` once, or only assert `packId`, are unaffected.
   Then thread `SchedulerStore` through `UserStores`/`AppOptions`/`resolve`/
   `ensureScheduler`, make `/question` re-serve `current` + write-through, make
   `/answer` `markAnswered` + write-through, make `PUT /packs` write-through, and
   wire `index.ts` + `worker.ts`, until green.

5. **Full gate.** Run the repo's `checks` equivalent (typecheck + tests + pack
   validation) green.

## Risks
- **Idempotent `/question` is the riskiest behavior change.** It's required for
  "a refresh cannot skip a question," and it's compatible with the real client
  (`Quiz.tsx` prefetches the next question only *after* `/answer` clears
  `current`, and consumes that prefetch on "Next" rather than re-requesting).
  The fallout is confined to server tests that pumped `/question` without
  answering — updated in slice 4, exactly the rewrite the spec anticipates.
- **Draw-loop budget.** Getting the bounded marble-pair budget wrong risks a
  false "no eligible cards" throw (budget too small) or a hot loop (unbounded).
  Mitigation: the empty-slice-fallthrough and empty-pool tests pin both ends.
- **Per-draw write cost.** `/question` and `/answer` now each write the whole
  `drawn`-bearing document (tens of KB at pool max). Accepted for v1 by the spec;
  normalizing `drawn` into a child table is noted, not built. The write-through
  test pins that the write happens exactly once per state-advancing request.
- **Alternative not taken:** serializing the *existing* materialized bags. It
  would snapshot per-learner difficulty into the saved state, letting a stale
  snapshot fight the global rating and reintroducing the only-flag bug on
  selection — rejected in the spec for the live-filtered draw.

## Proof
- `packages/engine/src/scheduler.test.ts`: the **un-skipped** "surfaces a newly
  included pack within a few cycles at real pool sizes" is green (proof for
  only-flag-questions); ratio/no-repeat/slice-refill/current tests green.
- `packages/server/src/app.test.ts`: the reload/resume test re-serves the same
  `current` question across a fresh app instance with no refill storm (proof for
  refresh-repeat); the idempotent-`/question`, write-through, select-all and
  deselect integration tests green.
- `storage.test.ts` / `supabase-storage.test.ts` / `rls.test.ts`: SchedulerStore
  round-trips and is RLS-isolated.
- Whole suite: the `checks` job (typecheck, tests, pack validation) passes — the
  spec's user stories 1–21 map onto the tests above; "done" is this suite green
  plus (separately, at completion) `scheduler.md`/`CONTEXT.md` updated.

## Links
Intent: sdlc/features/persist-bag-state/intent.md
Spec:   sdlc/features/persist-bag-state/spec.md
