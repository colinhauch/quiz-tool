# Spec: durable scheduler state via a filtered three-level draw

Status: accepted

Derived from `intent.md` (accepted). This is a **scheduler redesign**, not a
serialization of the current bags: it replaces materialized inner bags with a
filtered draw over the live card list, adds a per-learner durable state, and in
doing so fixes both the refresh-repeat bug and the only-flag-questions bug by
construction. `specs/learning/scheduler.md` is updated on completion, not here.

## Problem Statement

Two learner-visible failures, one root cause — scheduler state that only ever
lived in server memory.

- **Refresh repeats.** The live scheduler sits in an in-memory map, rebuilt from
  scratch on a fresh request. On Cloudflare Workers (stateless across isolates)
  and on any refresh, the pool refills and already-seen questions come back far
  too soon. A learner cannot leave and resume; the current question is lost.
- **Only flag questions.** With every pack selected, the quiz sometimes serves a
  long unbroken run from a single pack (flags). Selecting a pack adds it to the
  included set but not to the draw, so its cards do not appear until a bag drains
  (~200 questions away when ratings are uniform).

## Solution

From the learner's view: the quiz remembers exactly where they were — the
question on screen included — and picks up there after a refresh, a new device,
or days away. Difficulty stays current: as a card gets easier or harder for the
population, it quietly moves to the right difficulty band without disrupting
anyone mid-session. Selecting or deselecting a pack takes effect on the very next
question. Within a pass a learner sees each eligible card once before any repeats,
across a mix of difficulties and packs they control.

The mechanism is a three-level draw:

1. A **difficulty bag** of tier marbles in a configurable ratio picks the next
   difficulty `d`.
2. A **pack bag** of pack marbles in a configurable ratio (default: one marble
   per included pack) picks the next pack `p`.
3. The eligible card list is **filtered live** to `pack = p`, `P(success)` within
   tier `d`'s band, and *not in the `drawn` set*; one is chosen at random and
   becomes the **current** card, held until answered.

Answering updates the card's difficulty (unchanged rating logic) and adds its id
to `drawn`. When a `(d, p)` filter yields nothing un-drawn, the `drawn` entries
for *that slice* are cleared so those cards are eligible again (the "refill",
expressed as un-exclude). All of it — the two bags, `drawn`, `current`, and the
ratio config — is one small per-learner record, saved on every draw and every
selection change.

## User Stories

1. As a learner, I want the question I was on to still be there after I refresh, so that I never lose my place.
2. As a learner, I want to close the tab and come back later to the same point, so that I can learn in short sittings.
3. As a learner, I want to resume on a different device, so that my progress is not tied to one browser.
4. As a learner, I want a refresh to *not* hand me an easy escape from a hard question, so that the quiz stays honest.
5. As a learner, I want to not see the same question again until I have seen the others like it, so that practice covers the material.
6. As a learner, I want a controllable mix of easy, medium, and hard questions, so that the session is neither discouraging nor trivial.
7. As a learner, I want questions drawn across all my selected packs, not stuck on one, so that I study what I chose.
8. As a learner, I want a pack I just selected to start appearing immediately, so that the picker feels responsive.
9. As a learner, I want a pack I just deselected to stop appearing immediately, so that deselection is trusted.
10. As a learner, I want a card that has gotten easier or harder (because others answered it) to show up in the right difficulty band next time, so that the mix reflects reality.
11. As a learner answering on two tabs, I want a coherent (if last-writer-wins) resume, so that nothing crashes or corrupts.
12. As a new learner with no history, I want a sensible first session (everything mid-difficulty) with no special setup, so that I can start immediately.
13. As a learner who has answered everything in a slice, I want the quiz to keep going by revisiting, so that it never dead-ends.
14. As a learner, I want selecting/deselecting packs to never touch my answer history, so that my record is intact.
15. As the operator, I want per-learner state isolated by the same RLS as ratings and answers, so that no learner reads another's state.
16. As the operator, I want a configurable difficulty ratio and pack ratio, so that I can tune the mix without a code change to the algorithm.
17. As the operator, I want scheduler state to be a disposable cache that never contradicts the answer log or rating caches, so that it can be dropped and rebuilt safely.
18. As a developer, I want the draw to be a pure, seeded function, so that ordering is deterministic under test.
19. As a developer, I want the only-flag-questions repro test un-skipped and green, so that the fixed behavior is locked in.
20. As a developer, I want to add a new persisted store without a bespoke pattern, so that it mirrors the existing selection/rating stores.
21. As a learner mid-pass when a card I have not yet drawn drifts across a difficulty line, I accept it re-bins the next time it is filtered, so that the system stays simple and self-corrects.

## Implementation Decisions

**Engine — the scheduler becomes a filtered draw (primary change).**
- The scheduler state is redefined to: `included` packs, a `difficultyBag` (tier
  marbles remaining this cycle), a `packBag` (pack marbles remaining this cycle),
  a `drawn` set of card ids (the exclusion / "pulled" set), a `current` card id
  (held, unanswered, may be null), and the ratio configuration (`tiers` and a new
  `packRatio`). Inner "question bags" are **no longer materialized**.
- The draw is a pure, RNG-injected function over the current eligible cards and
  ratings: pop a difficulty marble, pop a pack marble, filter eligible cards to
  that `(pack, difficulty-band)` minus `drawn`, pick one at random, set it as
  `current`. Difficulty is read **live** from the rating cache on every draw —
  never stored in scheduler state.
- **Slice refill:** if the `(d, p)` filter yields no un-drawn card, clear the
  `drawn` ids belonging to that slice (pack `p`, current difficulty in tier `d`)
  and pick again. If still empty (the learner truly has no card there), redraw a
  different marble pair, with a bounded budget to avoid an infinite loop when a
  selection genuinely yields nothing (the existing empty-pool guard is retained).
- **Difficulty bag / pack bag** each refill to their configured ratio when empty,
  independently. Default `packRatio` is one marble per included pack.
- **Selection change** stops being special-cased: deselecting removes the pack's
  marble from the pack bag (and it is skipped on refill); selecting adds it, so
  the pack's cards are eligible on the very next draw. This is the mechanism that
  dissolves the only-flag-questions bug.
- New-learner / unrated behavior is unchanged in spirit: unrated cards read at the
  seed (`P = 0.5`) and filter into the medium tier.

**Server — persist and restore the scheduler state.**
- A new per-learner `SchedulerStore` mirrors the existing `SelectionStore`
  contract: `read(): SchedulerState | null` and `write(state)`. Single-user mode
  is a singleton; multi-user mode is scoped by the same JWT/RLS mechanism as the
  answer, rating, and selection stores.
- The in-memory scheduler map becomes a per-isolate cache, not the source of
  truth. On first request for a learner, restore from the store; if absent, build
  fresh (from the persisted selection + ratings) and persist it.
- **Write-through:** persist after every draw (the `/question` path advances
  state) and after every selection change (the `/packs` path). Last write wins
  across concurrent tabs — no locking in v1.
- **Restore reconciliation:** a restored state is validated against the current
  graph and selection — card ids no longer in the graph or in deselected packs
  are dropped (reuse the selection-filter logic); if the tier configuration has
  changed, the affected bag is rebuilt. Ratings drift needs no reconciliation
  because difficulty is filtered live.
- The `current` card is re-served on resume, so a refresh cannot skip a question.

**Storage — one small document per learner (decision: option A).**
- `SchedulerState` persists as a single record: the two bags, `drawn`, `current`,
  and the ratio config. Local (SQLite) stores it like `SelectionStore`; production
  (Supabase Postgres) stores it as a JSONB column on a per-learner row under the
  same RLS as the other per-learner tables.
- The `drawn` set lives inside that document for v1. It grows toward pool size
  over a pass (~1,500 ids max today, tens of KB); if per-draw write cost ever
  bites, normalize it into a child table — noted, not built.
- **No new questions table.** The eligible card list is enumerated from the graph
  and difficulty comes from the existing `card_difficulty` cache; filtering is an
  in-memory scan at current scale. Duplicating cards into the database is
  explicitly rejected (a second copy to keep in sync for no gain).

**Contract.** `/question`, `/packs` (GET and PUT), and `/answer` keep their
external shapes; the `queued` count on `/packs` still reports the eligible-pool
size. Any response-schema change is routed through the shared contract schemas,
as the existing handlers already are.

## Testing Decisions

Good tests here assert **externally observable behavior** — what card comes next,
what survives a reload, what a selection change does — never the internal shape of
the bags. The bags are an implementation detail that this very spec is changing,
so tests that assert bag internals would be rewritten needlessly.

- **Engine (pure, seeded) — the primary seam,** in the existing
  `scheduler.test.ts`. Prior art: the current draw/ratio/`applySelection` tests
  and the `seeded()` rng helper. Cover: the difficulty ratio holds over a cycle;
  no repeat within a pass until a slice is exhausted; slice refill re-admits drawn
  cards and re-bins by *live* difficulty; a newly selected pack is drawable on the
  next draw; a deselected pack stops immediately; the empty-slice fallthrough does
  not stall. **Un-skip** the committed repro "surfaces a newly included pack
  within a few cycles at real pool sizes" and make it green.
- **Store,** in `storage.test.ts` (SQLite) and `supabase-storage.test.ts`
  (Supabase), mirroring the `SelectionStore` tests: round-trip a `SchedulerState`,
  `null` on first read, whole-value overwrite on rewrite. RLS isolation follows
  the pattern in `rls.test.ts` — one learner cannot read another's state.
- **HTTP integration,** in `app.test.ts` via `app.request()` (the primary
  integration seam). Prior art: the existing `/question`, `/packs`, `/answer`
  flows. Cover the user-visible guarantees end to end: draw several questions,
  simulate a reload (a fresh app instance over the same store, empty in-memory
  cache) and assert the run resumes — same `current` question re-served, no
  refill storm; select all packs and assert non-flag questions appear promptly;
  deselect and assert the pack stops.
- Determinism: every engine test injects a seeded rng; integration tests inject
  the rng/clock through the existing app options.

## Out of Scope

- **Partial-credit accretion** and **comparison cards** — separately deferred in
  `scheduler.md`.
- **Non-default pack ratios** (proportional-to-size, weighting) — the ratio is
  configurable, but only the one-marble-per-pack default ships now.
- **Normalizing the `drawn` set** into its own table — kept in the state document
  for v1.
- **Concurrency control** across tabs beyond last-write-wins.
- **Updating `specs/learning/scheduler.md`** — done at build/completion, not part
  of this feature's runtime work (but required before the feature is "done").
- **Cross-pass analytics / mastery signals** derived from `drawn` — none here.

## Further Notes

- **Vocabulary.** This introduces *difficulty bag*, *pack bag*, and *drawn set*
  (the "pulled marbles"). `CONTEXT.md` and `scheduler.md` should adopt these on
  completion (via `domain-modeling`); the old materialized-bag language in
  `scheduler.md` is superseded.
- **Why live filtering wins.** Storing a card's difficulty inside a per-learner
  bag would let one learner's stale snapshot fight the global rating. Filtering
  the live card list keeps `card_difficulty` the single global source of truth
  (rebuildable from the Answer Log) and lets population-wide difficulty drift
  reflect immediately, for everyone, with no per-learner migration.
- **Accepted imperfection.** A not-yet-drawn card can drift across a difficulty
  line before it is next filtered; it re-bins only when its slice is next drawn or
  refilled. Accepted for simplicity — it self-corrects within a pass.
- **The only-flag-questions bug** and the **refresh-repeat bug** are not fixed by
  targeted patches; both are consequences of the old design that the redesign
  removes. The skipped repro test is the proof for the first; the reload
  integration test is the proof for the second.
