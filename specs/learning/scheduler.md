# Scheduler: Elo bag-of-bags

> **[UNREVIEWED]** — Designed in conversation, never built. Supersedes the `RandomLeastRecentScheduler` sketch in [README.md](README.md) and [interfaces.md](interfaces.md), which was never implemented. The **Question Queue** ([../../packages/engine/src/queue.ts](../../packages/engine/src/queue.ts)) is the provisional stand-in this replaces.

The scheduler decides which **card** to ask next. This design keeps selection *random* while *guaranteeing a difficulty distribution* — and adapts to the learner — by combining Elo ratings with a nested shuffle-bag draw. It **replaces spaced repetition**: there is no forgetting model in v1.

## Why not spaced repetition

The earlier plan was FSRS behind a `select`/`review` interface. It was dropped. Spaced repetition optimizes for *retention over time* — due dates, forgetting curves, per-card stability. That is a large machine, and the product it serves ("quiz me adaptively on geography") does not need a forgetting model to be good. What it needs is: never ask something far above or below the learner's level, keep it varied, keep it moving. Elo gives that directly, and everything it computes is recomputable from the **Answer Log** by replay, so a better model applies retroactively to all history (the retroactivity principle in [README.md](README.md)).

The cost is explicit and accepted: **a card the learner mastered in January is still "easy" in August**, because nothing decays. When retention matters, a time-decay on ability or a spacing layer goes on *top* of this — the bag structure does not change.

## The rating model (Elo / Rasch)

Two ratings, both on a 400-point scale, everything seeded at **1500**:

- **Difficulty `D`** — per **card** (`statement` + **hidden slot**, i.e. the card id `statementId:hiddenSlot`). **Global**: updated by every learner's answers. "Name the capital of Chad" is hard for everyone; that is a property of the card, not the person.
- **Ability `θ`** — per **`(learner, pack)`**. A learner strong on capitals and weak on languages has two different θ, one per pack. Because packs are largely single-relation, per-pack θ approximates per-relation ability without the cold-start cost of a finer split.

Probability of a correct answer is the standard Elo/Rasch expectation:

```
P(success) = 1 / (1 + 10^((D − θ_pack) / 400))
```

`θ_pack` is the learner's ability for the pack that **owns** the card's statement. Single-owner packs make this unambiguous — a card maps to exactly one pack, so which θ to read and which θ to update is never in question.

### Updates

One outcome per answer, binary (`1` correct, `0` incorrect). Both the card's `D` and the owning pack's `θ` move by the Elo rule:

```
new = old + K · (actual − P(success))
```

The two ratings move by the **same magnitude in opposite directions**: `θ += K·(actual − P)` and `D −= K·(actual − P)`. A correct answer makes the learner look abler (`θ` up) and the card look easier (`D` down) by an equal step — standard pairwise Elo, with the card as the opponent whose rating is its difficulty. The shorthand `new = old + K·(actual − P)` above names the shared *magnitude*; taken literally for `D` it would make a card everyone answers correctly climb in difficulty, which is backwards, so difficulty carries the opposite sign. (Resolved while implementing #119; the `[UNREVIEWED]` marker still stands.)

**One K per answer event, taken from the card's answer count** — not the learner's. K is `40` while the card is *provisional* (its first ~10 answers) and `20` once *settled*. This means a brand-new card moves both its own `D` and the learner's `θ` at the high provisional rate. The accepted wrinkle: a fresh card can swing a veteran's θ by the full 40 — high K justified by *card* uncertainty is being used to move the *learner's* rating. The reverse cost (a settled card converging a new learner slowly) is smaller. Both are re-tunable by replay if alpha shows θ cold-start is sluggish or veteran θ is jumpy. K, the scale, and the seed are calibration dials, not architecture.

### Correctness is binary and comes from answer-resolution

A card's question is satisfied by *any* true answer to its hidden slot: "name a city in Brazil" generated from the Recife statement is answered correctly by "São Paulo," because São Paulo *is* a city in Brazil. So the rating outcome is simply: **did the learner's resolved answer satisfy the asked card's hidden slot?** — `1` if it resolves to a true statement fulfilling the slot, `0` otherwise. An answer that resolves to an edge *not in the graph* (`s(NYC, isIn, Brazil)`) is `0`, logged as misconception signal, and moves **no** card's `D` (there is no valid card for it). Exactly one card is rated per answer.

## Selection: bag of bags

A **shuffle bag** is sampling without replacement: fill it, draw until empty, refill. It buys coverage (everything gets drawn once per cycle), no repeats within a cycle, and — nested — a guaranteed distribution.

- **Top bag** holds difficulty-tier *marbles* in a fixed ratio (e.g. easy/medium/hard). Drawn as a shuffle bag, the ratio is honored *exactly* per cycle, not just in expectation. This is the difficulty-mix knob. The exact tiers, thresholds, and ratio are tuning left for later.
- **Inner bags**, one per tier, hold the actual cards whose `P(success)` falls in that tier's band (e.g. easy = P > 0.8, hard = P < 0.2). Drawn without replacement.

A draw picks a marble from the top bag (say "easy"), then a card from that tier's inner bag.

### Binning and re-binning

The **eligible pool** is every card enumerated from the learner's **included** packs, both hidden slots, comparisons excluded. At the start (page load / pack change) the whole pool is binned by `P(success)` into the inner bags. A brand-new card, seeded at `D = θ = 1500`, has `P(success) = 0.5` and lands in the medium tier — that *is* the new-card introduction story, no separate lane.

When **one inner bag empties, re-bin only that bag**: recompute which currently-eligible cards fall in *its* band (ratings have drifted since the session began, because every answer nudges `D` and `θ`) and refill just it. **The other bags are untouched; the whole pool is not reshuffled.** Re-draws are allowed — a card answered earlier can return when its bag refills; there is no within-session exclusion in v1 (that is the intended cross-session mechanism, deferred).

If the top bag draws a tier whose inner bag is empty, **re-bin that tier to refill it**; if it is *still* empty (the learner genuinely has no eligible cards in that band), **redraw a different marble** from the top bag. The top bag itself refills with the same ratio when it empties.

Ratings drift *during* a session but a card does not change bins until its home bag is re-binned — stable within a cycle, adaptive across cycles.

## Ratings are cached, the log is truth

Ratings live in two cache tables — a global **card-difficulty** table keyed by card id, and a per-`(learner, pack)` **ability** table — updated online as answers arrive. Neither is the source of truth: both are **rebuildable by replaying the Answer Log** in `asked_at` order. This preserves retroactivity (change K or the formula, replay, all history reinterpreted) while keeping per-answer updates O(1) instead of re-reading all history each session.

## The log snapshots the scheduler's inputs at ask time

The Answer Log gains, per row, the scheduler's *belief at the moment it asked*: the card's `D`, the owning pack's `θ`, the `K` applied, and the `pack_id` the ability was read from. `P(success)` is **not** stored — it is a pure function of `D` and `θ`.

This bends the "**the log stores no derived judgments**" rule in [README.md](README.md), which must be amended: the log stores no derived **judgments** (skill scores, mastery levels), but it *does* snapshot the scheduler's rating **inputs** at ask time as part of "what happened." The snapshot is denormalized telemetry — rebuildable by replay, never the source of truth — and it is what makes "difficulty vs. outcome" analysis and future partial-credit design possible without a replay.

## Deferred

- **Partial-credit accretion** (v2): a "close but wrong" answer (São Paulo when the card was generated from Recife, resolving to a *different* true statement) splitting graded credit across the resolved card and the generated-from card. Binary v1 logs latency and both card references so the data to *design* this accumulates; it turns on by replay.
- **Comparison cards** (v2): two statements, two hidden values, no single `(statement, hidden-slot)` coordinate, so no home for a `D`. Excluded from Elo and the bags for v1.
- **Top-level bag of packs**: pick a pack, then a tier, then a card — so an emptied pack refills before another is drawn from. A future third nesting level.
- **Cross-session recency exclusion**: remove recently-answered cards from all bags at the start of a new session, re-admitting only when the pool is exhausted.
- **Per-relation / per-region θ**, **pack-authored difficulty priors**, and **tier thresholds + ratio tuning** — all data-driven, revisited once alpha shows whether the single-θ-per-pack conflation or the seed values actually hurt.
- **Revisiting statement-vs-card accreditation** — which coordinate a "wrong-but-valid" answer credits.
```
