# Intent: Verify and improve the bag-of-bags question queueing

Status: draft

## Problem

The bag-of-bags scheduler (`specs/learning/scheduler.md`,
`packages/engine/src/scheduler.ts`) decides which card to ask next. It doesn't
feel like it's working perfectly in practice. Two things are wanted:

1. **A check** — confirm whether the queueing is actually doing what the spec
   says (honoring the difficulty ratio per cycle, re-binning correctly, adapting
   as ratings drift, not repeating/starving).
2. **Iterate and possibly improve** the system once we know where it stands.

## Why it matters

Selection is the core of the product loop — it decides every question the learner
sees. If the difficulty mix, coverage, or adaptivity is off, the whole "quiz me
adaptively" promise degrades, and it degrades silently: a learner just gets a
worse mix with no error. Worth confirming it works before building more on top.

## Proposed outcome

- Confidence that the scheduler behaves as specified in the live app, backed by
  something checkable (test, replay, or observation) rather than a hunch.
- Any confirmed defects fixed.
- Optionally, targeted improvements to the mix/adaptivity if the check surfaces
  weak spots.

## Affected users & systems

- `packages/engine/src/scheduler.ts` (the engine draw logic) and its tests.
- `packages/server/src/app.ts` — owns the one live scheduler instance per
  learner, the RNG, and the rating tables; where engine state meets the request
  lifecycle.
- Every learner, on every question drawn.

## Constraints

- Ratings/log are the source of truth; scheduler state is a cache/derivation
  (retroactivity principle). Don't break that.
- Keep the `checks` CI job green (typecheck, tests, pack validation).
- No schema break unless justified and captured.

## Out of scope

- v2 items already deferred in the spec (partial-credit accretion, comparison
  cards, top-level bag of packs, cross-session recency exclusion, per-relation θ)
  — unless the check shows one is the actual cause of the problem.
- Replacing Elo or reintroducing spaced repetition.

## Open questions

- **What is "not working"?** Concrete symptom to reproduce — wrong difficulty
  mix, repeats, starvation, no adaptation, something else? (User to describe /
  we observe.)
- **Does live scheduler state survive the request lifecycle?** `app.ts` holds
  schedulers in an in-memory `Map` keyed per learner. On a stateless/ephemeral
  Worker, is that `Map` persisted across requests and isolates, or is the
  bag/cycle state rebuilt (and cycle progress lost) on each draw? This is the
  first thing to check — if state doesn't persist, per-cycle guarantees never
  hold in production.
- How do we *verify* the ratio holds per cycle in the deployed app vs. just in
  unit tests?
- Are the default tiers/thresholds/ratio (`DEFAULT_TIERS`) the issue, or is the
  mechanism itself misbehaving?
