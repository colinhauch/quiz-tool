# Intent: persist bag-of-bags state across sessions

Author: colin.hauch@gmail.com. Status: accepted

## Problem
The bag-of-bags scheduler's live state — which marbles are left in each bag and
which have already been drawn — is not saved. On a page refresh, or when I come
back after checking my recent answers, the pool refills and the draw starts over.
The visible symptom: the same question comes up too frequently, because
refreshing puts every already-drawn marble back in the bag.

## Why it matters
It breaks the core promise of the shuffle bag — coverage and no repeats within a
cycle. Refreshing is a normal thing to do, and each refresh silently resets the
cycle, so a learner sees the same cards over and over instead of moving through
the pool. The quiz feels broken and less useful for learning.

## Proposed outcome
When I refresh or return, I continue from the bag state I was just in — including
the exact question I was on — instead of the pool refilling and repeating cards.

Brainstorming during design (see `spec.md`) showed the cleanest way to get this
is a small **scheduler redesign** rather than serializing the current bags: a
three-level draw (difficulty bag → pack bag → question), with drawn cards tracked
in a `drawn` exclusion set and eligibility computed by **filtering the live card
list** at draw time. This makes the saved state small and durable, keeps card
difficulty live (other learners' answers reflected immediately), and makes both
this bug and the flag-only bug (below) disappear by construction rather than by
patch.

## Affected users & systems
Learners (the person taking the quiz). The engine `Scheduler` state
(`included` / `topBag` / `bags` in `packages/engine/src/scheduler.ts`), the
server's in-memory scheduler `Map` in `packages/server/src/app.ts` (currently not
persisted — "the bag state it produces is not [durable]"), the storage layer
(`packages/server/src/storage.ts`, alongside the existing `SelectionStore`), and
the Supabase schema. The web app's page-load / refresh path.

## Constraints
- Don't disturb the ratings model: `card_difficulty` / `pack_ability` stay
  rebuildable by replaying the Answer Log. This adds scheduler state, it doesn't
  change how ratings work. Card difficulty is read **live** at draw time, never
  snapshotted into the saved state.
- The saved state is keyed per learner.
- The durable pack selection remains the source of truth for included packs.
- The difficulty mix and the pack mix must both be **configurable ratios**
  (default: the existing tier ratio; one marble per selected pack).

## Out of scope
- Partial-credit accretion and comparison cards (separately deferred).
- Proportional-to-size or other non-default pack ratios ship as config later; the
  knob exists, the default is one-per-pack.

## Resolved (were open questions)
- **Only-flag-questions bug** — diagnosed (repro: skipped test in
  `packages/engine/src/scheduler.test.ts`). Root cause: `applySelection` adds a
  newly-selected pack to `included` but not to the bags, so with all-medium
  ratings nothing re-bins until the medium bag drains (~200 cards). The redesign
  dissolves it: a pack marble is added to the pack bag on selection, so its cards
  are eligible on the next draw.
- **Workers statelessness** — confirmed contributing: the live scheduler lives
  only in an in-memory `Map`, lost on a fresh Worker isolate, so state is rebuilt
  (pool refills) even without a manual refresh. Persisting the state fixes this.
- **Persist what / when / keying** — persist a small per-learner `scheduler_state`
  doc (difficulty bag, pack bag, `drawn` set, current card, config); write-through
  per draw and per selection change; keyed as the other stores are (single-user
  singleton; multi-user by RLS/user id). See `spec.md`.
- **Multiple tabs** — last write wins, matching `SelectionStore`. Accepted for v1.
