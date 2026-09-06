# Scheduler: Elo filtered draw

> **[UNREVIEWED]** — The rating model and the tuning constants (K, seed, tier bands, ratio) are drafted, not human-verified; the *selection* design below is built and covered by tests (`packages/engine/src/scheduler.ts`, `sdlc/features/persist-bag-state`). Supersedes the `RandomLeastRecentScheduler` sketch in [README.md](README.md) and [interfaces.md](interfaces.md) and the provisional **Question Queue** (`queue.ts`), both retired.

The scheduler decides which **card** to ask next. This design keeps selection *random* while *guaranteeing a difficulty distribution and a spread across packs* — and adapts to the learner — by combining Elo ratings with a filtered three-level draw over the live card list. It **replaces spaced repetition**: there is no forgetting model in v1.

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

## Selection: a filtered three-level draw

Selection is a **filtered three-level draw** over the live eligible pool — no materialized per-tier bags of card ids. (The earlier design *did* materialize one inner bag per tier; `persist-bag-state` replaced it. A per-learner bag snapshot could fight the global difficulty rating, and adding a pack to the selection left its cards invisible for a whole cycle because they were folded in only on the next re-bin — the "all packs selected but only flag questions" bug.)

A **shuffle bag** is sampling without replacement: fill it, draw until empty, refill. Two bags of *marbles* drive the draw:

- **Difficulty bag** — difficulty-tier marbles in a fixed ratio (e.g. easy/medium/hard). Drawn as a shuffle bag, the ratio is honored *exactly* per cycle, not just in expectation. This is the difficulty-mix knob; the tiers, thresholds, and ratio are tuning left for later.
- **Pack bag** — pack marbles, one per **included** pack by default (a configurable pack ratio). Drawn without replacement, so a pass spreads across the selected packs instead of getting stuck on one.

The card is chosen by **live filtering**, not from a stored bag. Pop a difficulty marble `d` and a pack marble `p`, then filter the current **eligible pool** — every card from the included packs, both hidden slots, comparisons excluded — to `pack = p`, `P(success)` within tier `d`'s band, and **not in the drawn set**. One survivor is picked at random and becomes the **current** card, held until answered. A brand-new card, seeded at `D = θ = 1500`, has `P(success) = 0.5` and filters into the medium tier — that *is* the new-card introduction, no separate lane.

### The drawn set and slice refill

The **drawn set** is the exclusion list: card ids already handed out this pass. Difficulty is read **live** from the rating cache on every draw and never stored in the state, so a card that got easier or harder for the population moves to the right band immediately, for everyone — no per-learner re-bin, no stale snapshot.

A `(d, p)` pair names a **slice** of the pool. When a slice has no un-drawn card left (exhausted), the drawn ids *belonging to that slice* are cleared — the "refill", expressed as un-exclude — so its cards are eligible again and the learner revisits rather than dead-ends. Because the filter is live, a card that drifted out of the band since it was drawn is not re-admitted here; it belongs to whichever slice now owns it.

Because the pack bag draws **without replacement**, the pack marble is *peeked*, not consumed, whenever its pack has no card in the drawn band: that is a difficulty *mismatch*, and spending the pack's turn on it would let another pack repeat before this one is seen. The marble is spent only when the pack yields a card. A pack with no eligible cards at all discards its marble (a stall guard). The loop is bounded — every `(tier, pack)` pair is examined before it concludes the pool is empty and throws the empty-pool error the selection contract (never an empty included set) is meant to prevent.

### Selection changes take effect immediately

Deselecting a pack removes its marbles from the pack bag and drops its cards from the drawn set at once. Selecting a pack appends its marble so it is drawable on the **very next draw** — the mechanism that dissolves the only-flag-questions bug. The difficulty bag is untouched: a selection change alters *which* cards are eligible, not the difficulty mix.

## The state is durable, per learner

The whole draw — the two bags, the drawn set, the held **current** card, and the ratio config (`tiers`, `packRatio`) — is one small JSON document persisted per learner: a `scheduler_state` row under the same RLS as ratings and answers (single-user local mode is a one-row table). It is written through on every draw, every answer, and every selection change, and restored on a fresh request. The in-memory scheduler is a per-isolate **cache**, not the source of truth.

Two learner-visible consequences:

- **Resume, don't refill.** A refresh, a fresh Cloudflare Worker isolate, or a new device re-serves the exact **current** question and continues the same pass, instead of rebuilding from scratch and re-serving already-seen cards.
- **A refresh can't skip.** `current` is re-served (drawing nothing) until it is answered, so reloading cannot hand the learner an easier question.

The state is a **disposable cache** that never contradicts the Answer Log or the rating caches: on restore it is reconciled to the authoritative selection (stale ids and a stale `current` dropped, deselected packs removed) and, if the tier config has changed since it was saved, the difficulty bag is rebuilt. Lost entirely, it rebuilds from the persisted selection.

## Ratings are cached, the log is truth

Ratings live in two cache tables — a global **card-difficulty** table keyed by card id, and a per-`(learner, pack)` **ability** table — updated online as answers arrive. Neither is the source of truth: both are **rebuildable by replaying the Answer Log** in `asked_at` order. This preserves retroactivity (change K or the formula, replay, all history reinterpreted) while keeping per-answer updates O(1) instead of re-reading all history each session.

## The log snapshots the scheduler's inputs at ask time

The Answer Log gains, per row, the scheduler's *belief at the moment it asked*: the card's `D`, the owning pack's `θ`, the `K` applied, and the `pack_id` the ability was read from. `P(success)` is **not** stored — it is a pure function of `D` and `θ`.

This bends the "**the log stores no derived judgments**" rule in [README.md](README.md), which must be amended: the log stores no derived **judgments** (skill scores, mastery levels), but it *does* snapshot the scheduler's rating **inputs** at ask time as part of "what happened." The snapshot is denormalized telemetry — rebuildable by replay, never the source of truth — and it is what makes "difficulty vs. outcome" analysis and future partial-credit design possible without a replay.

## Deferred

- **Partial-credit accretion** (v2): a "close but wrong" answer (São Paulo when the card was generated from Recife, resolving to a *different* true statement) splitting graded credit across the resolved card and the generated-from card. Binary v1 logs latency and both card references so the data to *design* this accumulates; it turns on by replay.
- **Comparison cards** (v2): two statements, two hidden values, no single `(statement, hidden-slot)` coordinate, so no home for a `D`. Excluded from Elo and the bags for v1.
- **Non-default pack/difficulty ratios**: the pack ratio and tier ratio are configurable parameters, but only the one-marble-per-pack default and `DEFAULT_TIERS` ship now; there is no operator-facing config to set a non-default without a code change (built via `persist-bag-state`, deferred there).
- **Normalizing the drawn set**: it lives inside the state document for v1 (grows toward pool size over a pass, tens of KB); a child table is noted if per-draw write cost ever bites.
- **A recency window across passes**: the drawn set already excludes within a pass and persists across sessions, so a resumed pass does not repeat; a broader "don't re-ask what I saw last week" window on top of that is not built.
- **Per-relation / per-region θ**, **pack-authored difficulty priors**, and **tier thresholds + ratio tuning** — all data-driven, revisited once alpha shows whether the single-θ-per-pack conflation or the seed values actually hurt.
- **Revisiting statement-vs-card accreditation** — which coordinate a "wrong-but-valid" answer credits.
```
