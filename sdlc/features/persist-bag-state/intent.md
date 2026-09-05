# Intent: persist bag-of-bags state across sessions

Author: colin.hauch@gmail.com. Status: draft

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
When I refresh or return, I continue from the bag state I was just in: the same
marbles remaining in each bag, the same ones already drawn out. We do **not**
need to precompute which marbles come next — we just need to remember the current
state and restore it instead of refilling. My progress (ratings) already carries
over; this is about the transient draw state carrying over too.

## Affected users & systems
Learners (the person taking the quiz). The engine `Scheduler` state
(`included` / `topBag` / `bags` in `packages/engine/src/scheduler.ts`), the
server's in-memory scheduler `Map` in `packages/server/src/app.ts` (currently not
persisted — "the bag state it produces is not [durable]"), the storage layer
(`packages/server/src/storage.ts`, alongside the existing `SelectionStore`), and
the Supabase schema. The web app's page-load / refresh path.

## Constraints
- Don't precompute future draws — persist and restore current state only.
- Don't disturb the ratings model: `card_difficulty` / `pack_ability` stay
  rebuildable by replaying the Answer Log. This adds state, it doesn't change how
  ratings work.
- The saved bag state is keyed per learner and reset on pack change (a new
  included set is a new pool).
- The durable pack selection remains the source of truth for included packs.

## Out of scope
- Cross-session recency exclusion beyond restoring state, the `bag of packs`
  third nesting level (`scheduler.md:77`), partial-credit accretion, and
  comparison cards — all separately deferred.

## Open questions
- The scheduler as built nests `[difficulty tier] → [card]` (two levels), not
  `[difficulty] → [pack] → [question]` as I'd assumed — the pack layer is the
  deferred v2 "bag of packs." Do we persist the two-level state as-is, or is the
  pack layer expected to land first? (Resolve in spec.)
- Is the in-memory scheduler `Map` even surviving across Cloudflare Workers
  requests? Workers isolates are stateless across requests, so this may be the
  real reason repeats show up even *without* a manual refresh. Confirm whether
  that's the root cause or a separate bug.
- Related bug, **diagnosed** (repro: skipped test
  `packages/engine/src/scheduler.test.ts` → "surfaces a newly included pack
  within a few cycles at real pool sizes"): with **all packs selected** the quiz
  serves **only flag questions** for a long run. Root cause — `applySelection`
  (`packages/engine/src/scheduler.ts`) adds a newly-selected pack to `included`
  but **not to the bags**; new-pack cards fold in only when a tier bag re-bins,
  and with unrated (all-medium) ratings only the medium bag yields, so nothing
  re-bins until it fully drains (~200 cards in prod). Matches the spec's letter
  (`scheduler.md`: "picked up on the next re-bin") but the spec assumed re-bin is
  prompt. **Fix is a design decision** (fold new packs in eagerly on
  `applySelection` vs. rebuild vs. spec change) and is entangled with this
  feature — resolve in spec.
- Where is the state persisted, and when is it written (every draw? every
  answer?) and invalidated (pack change)?
- How is "the learner" identified for keying the saved state (single-user mode
  vs. multi-user)?
- Multiple tabs / concurrent sessions for one learner — what wins?
