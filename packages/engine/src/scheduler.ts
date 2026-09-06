import { type Card, enumerateCards, findCard, makeCardId } from "./card.js";
import { type Ratings, abilityOf, difficultyOf, probabilityOfSuccess } from "./rating.js";
import type { Pack } from "./types.js";

/**
 * The scheduler (spec `specs/learning/scheduler.md`, redesigned by
 * sdlc/features/persist-bag-state). It decides which **card** to ask next and is
 * the thing the server persists per learner.
 *
 * It is a **filtered three-level draw**, not a set of materialized bags:
 *
 * - The **difficulty bag** holds tier *marbles* in a fixed ratio (see {@link Tier}).
 *   Drawn without replacement, the ratio is honoured *exactly* per cycle — the
 *   difficulty-mix knob.
 * - The **pack bag** holds pack *marbles* in a configurable ratio (default: one
 *   marble per included pack). Drawn without replacement, so a cycle spreads
 *   across the selected packs.
 * - The eligible card list is **filtered live** on every draw to the drawn
 *   `(pack, difficulty-band)`, minus a `drawn` exclusion set. One survivor is
 *   picked at random and becomes {@link Scheduler.current}, held until answered.
 *
 * Difficulty is read **live** from the ratings on every draw and never stored in
 * the scheduler, so population-wide drift is reflected for everyone with no
 * per-learner migration (spec: "why live filtering wins"). A brand-new card
 * seeds at `P = 0.5` and filters into the medium tier — that *is* the new-card
 * introduction, no separate lane.
 *
 * Everything here is pure and RNG-injected: the state is all JSON-safe
 * (arrays/objects/string/null) so the whole value persists directly. The server
 * owns the one live instance, the randomness, the rating tables, and the durable
 * store; the engine owns what a draw *is*.
 */

/** Random source, injected so every ordering decision is deterministic under test. */
export type Rng = () => number;

/**
 * A difficulty tier: a `P(success)` band and how many marbles it puts in the
 * difficulty bag per cycle. The band is `[min, max)` — half-open so the tiers
 * partition `[0, 1]` with no card falling in two (give the top tier a `max` above
 * 1 so a perfect `P = 1` still lands somewhere). `marbles` is the tier's share of
 * the difficulty mix: a cycle draws exactly `marbles` cards from this tier.
 */
export interface Tier {
  readonly name: string;
  /** `P(success)` lower bound, inclusive. */
  readonly min: number;
  /** `P(success)` upper bound, exclusive. */
  readonly max: number;
  /** How many of this tier's cards a full difficulty-bag cycle draws. */
  readonly marbles: number;
}

/**
 * The default difficulty mix: mostly at-level (medium), a lighter helping of
 * easy for coverage and confidence, and the fewest hard. New cards (`P ≈ 0.5`)
 * land in medium. Thresholds and ratio are the obvious dials to tune once alpha
 * data exists; the shape is a parameter, not architecture.
 */
export const DEFAULT_TIERS: readonly Tier[] = [
  { name: "hard", min: 0, max: 0.2, marbles: 1 },
  { name: "medium", min: 0.2, max: 0.8, marbles: 3 },
  { name: "easy", min: 0.8, max: 1.01, marbles: 2 },
];

/**
 * The scheduler's whole mutable-by-replacement state — a small, JSON-safe
 * per-learner document.
 *
 * `included` is carried so the draw is self-describing: re-selecting compares
 * against the packs *this* scheduler was built from. `difficultyBag` and
 * `packBag` hold the marbles yet to be drawn this cycle; each refills to its
 * configured ratio when empty. `drawn` is the exclusion set — card ids already
 * handed out this pass, cleared per-slice on refill. `current` is the card drawn
 * but not yet answered, held so a refresh re-serves it instead of skipping it.
 */
export interface Scheduler {
  /** Pack ids the eligible pool is drawn from. Never empty. */
  readonly included: readonly string[];
  /** The tier configuration — bands and ratio. Carried so a draw is self-describing. */
  readonly tiers: readonly Tier[];
  /** Pack id → marbles it contributes to the pack bag per cycle; absent ⇒ 1. */
  readonly packRatio: Readonly<Record<string, number>>;
  /** Tier names still to be drawn this cycle. Refills to the tier ratio when empty. */
  readonly difficultyBag: readonly string[];
  /** Pack ids still to be drawn this cycle. Refills from `included`×`packRatio` when empty. */
  readonly packBag: readonly string[];
  /** Card ids already drawn this pass — the exclusion set. Cleared per slice on refill. */
  readonly drawn: readonly string[];
  /** The held, drawn-but-unanswered card id, re-served on resume; null when none. */
  readonly current: string | null;
}

/**
 * One card per `(subject, relation)` for object-hidden cards — a country with
 * several official languages renders the identical object-hidden prompt, so a
 * cycle asks it once (any-of grading accepts any true answer). Ported verbatim
 * from the queue it replaces; subject-hidden and other slots are untouched.
 */
function dedupeObjectHidden(cards: Card[]): Card[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (card.hiddenSlot !== "object") return true;
    const key = `${card.statement.subject} ${card.statement.relation}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The eligible pool: every card enumerated from the included packs whose
 * relation has a generator, both hidden slots, object-hidden duplicates
 * collapsed. Comparison cards have no `(statement, hidden-slot)` coordinate and
 * are not enumerated, so they are excluded for free (spec: comparisons are v2).
 */
export function eligibleCards(graph: Pack, included: readonly string[]): Card[] {
  const packs = new Set(included);
  const drawable = enumerateCards(graph).filter(
    (card) => card.statement.relation in graph.generators && packs.has(card.statement.pack),
  );
  return dedupeObjectHidden(drawable);
}

/** Fisher-Yates, so `rng` fully determines the order — identical to the queue's. */
function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** The tier whose half-open band contains `p`, or `undefined` if none does. */
function tierOf(tiers: readonly Tier[], p: number): Tier | undefined {
  return tiers.find((tier) => p >= tier.min && p < tier.max);
}

/**
 * Rejects tiers that don't partition `[0, 1]` — a gap or overlap between bands
 * would silently drop a card whose `P(success)` falls in it (binned nowhere, so
 * never drawable, yet still counted as eligible/`queued`). Bands must be sorted,
 * contiguous (`max === next.min`), start at or below 0, and reach past 1 so the
 * half-open top band still contains `P = 1`. DEFAULT_TIERS satisfies this; the
 * check turns a mis-tuned custom ratio into a loud error instead of a card that
 * is quizzed-on-paper but unschedulable.
 */
function assertTiersPartition(tiers: readonly Tier[]): void {
  const sorted = [...tiers].sort((a, b) => a.min - b.min);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last || first.min > 0 || last.max <= 1) {
    throw new Error(`tiers must cover [0, 1]: ${JSON.stringify(tiers)}`);
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i]?.max !== sorted[i + 1]?.min) {
      throw new Error(`tiers must be contiguous (no gap or overlap): ${JSON.stringify(tiers)}`);
    }
  }
}

/** `P(success)` for a card: its difficulty against the learner's ability for its owning pack. */
function successProbability(ratings: Ratings, learnerId: string, card: Card): number {
  const cardId = makeCardId(card.statement.id, card.hiddenSlot);
  const difficulty = difficultyOf(ratings, cardId);
  const ability = abilityOf(ratings, learnerId, card.statement.pack);
  return probabilityOfSuccess(difficulty, ability);
}

/** A fresh, shuffled difficulty bag holding each tier's `marbles` count — the full cycle. */
function fillDifficultyBag(tiers: readonly Tier[], rng: Rng): string[] {
  const marbles: string[] = [];
  for (const tier of tiers) {
    for (let i = 0; i < tier.marbles; i++) marbles.push(tier.name);
  }
  return shuffle(marbles, rng);
}

/** A fresh, shuffled pack bag: each included pack contributes `packRatio[p] ?? 1` marbles. */
function fillPackBag(
  included: readonly string[],
  packRatio: Readonly<Record<string, number>>,
  rng: Rng,
): string[] {
  const marbles: string[] = [];
  for (const pack of included) {
    for (let i = 0; i < (packRatio[pack] ?? 1); i++) marbles.push(pack);
  }
  return shuffle(marbles, rng);
}

/**
 * A fresh scheduler for a selection: full difficulty and pack bags, an empty
 * `drawn` set, and no held card. Note the signature: no `ratings`/`learnerId` —
 * a fresh build does not bin the pool (difficulty is filtered live at draw
 * time), so it needs no ratings.
 *
 * Throws on a selection that yields no eligible cards — an empty pack list, or
 * packs shipping nothing quizzable. This is the backstop that keeps "the learner
 * is being quizzed on nothing" from ever being a silent state.
 */
export function buildScheduler(
  graph: Pack,
  included: readonly string[],
  rng: Rng = Math.random,
  tiers: readonly Tier[] = DEFAULT_TIERS,
  packRatio: Readonly<Record<string, number>> = {},
): Scheduler {
  assertTiersPartition(tiers);
  if (eligibleCards(graph, included).length === 0) {
    throw new Error(`no eligible cards in packs: ${included.join(", ") || "(none)"}`);
  }
  return {
    included: [...included],
    tiers,
    packRatio,
    difficultyBag: fillDifficultyBag(tiers, rng),
    packBag: fillPackBag(included, packRatio, rng),
    drawn: [],
    current: null,
  };
}

/**
 * Draws the next card by the three-level filtered draw: a difficulty marble
 * picks a band, a pack marble picks a pack, and the live eligible pool is
 * filtered to that `(pack, band)` minus the `drawn` set. One survivor is chosen
 * at random, added to `drawn`, and held as `current`.
 *
 * Always draws — it does **not** short-circuit on a held `current` (the re-serve
 * guard is the server's, so the pure draw stays self-excluding and
 * seed-deterministic under test). When a `(band, pack)` slice yields no un-drawn
 * card, the `drawn` ids belonging to *that slice* are cleared (the "refill",
 * expressed as un-exclude) and it is re-filtered; if the slice has no cards at
 * all, another marble pair is drawn. Each bag refills to its ratio when empty.
 *
 * The loop is bounded so every `(band, pack)` pair is examined before concluding
 * the pool is empty; only then does it throw — which the selection contract
 * (never an empty included set) is meant to prevent.
 */
export function drawNext(
  graph: Pack,
  ratings: Ratings,
  learnerId: string,
  scheduler: Scheduler,
  rng: Rng = Math.random,
): { card: Card; scheduler: Scheduler } {
  const { included, tiers, packRatio } = scheduler;
  const difficultyBag = [...scheduler.difficultyBag];
  const packBag = [...scheduler.packBag];
  const drawn = new Set(scheduler.drawn);

  const pool = eligibleCards(graph, included);
  const bandOf = (card: Card): string | undefined => tierOf(tiers, successProbability(ratings, learnerId, card))?.name;

  // Enough marble pairs to drain the carried bags and then examine a full fresh
  // cycle of each — in which every tier and every pack appears at least once, so
  // any non-empty (band, pack) slice is found. Only when even that turns up
  // nothing is the pool genuinely empty.
  const cycleTiers = tiers.reduce((n, t) => n + t.marbles, 0);
  const cyclePacks = included.reduce((n, p) => n + (packRatio[p] ?? 1), 0);
  let budget = (difficultyBag.length + cycleTiers) * (packBag.length + cyclePacks);
  while (budget-- > 0) {
    if (difficultyBag.length === 0) difficultyBag.push(...fillDifficultyBag(tiers, rng));
    const band = difficultyBag.pop() as string;
    if (packBag.length === 0) packBag.push(...fillPackBag(included, packRatio, rng));
    // Peek the pack marble rather than consuming it: the pack bag draws without
    // replacement so a pass spreads across packs (spec: "questions across all my
    // selected packs, not stuck on one"). If this pack simply has no card in the
    // drawn band, that is a difficulty *mismatch* — keep the pack for the next
    // difficulty marble instead of burning its turn (which would let another pack
    // repeat before this one is seen). Only a pack that yields a card consumes its
    // marble.
    const pack = packBag[packBag.length - 1];

    const inSlice = (card: Card): boolean => card.statement.pack === pack && bandOf(card) === band;
    const slice = pool.filter(inSlice);
    if (slice.length === 0) {
      // No card in this band. If the pack has no eligible card at all it is dead
      // — discard its marble so it stops blocking the peek; otherwise keep it and
      // let the next difficulty marble find its cards.
      if (!pool.some((card) => card.statement.pack === pack)) packBag.pop();
      continue;
    }

    packBag.pop(); // The pack yields — spend its marble.
    let candidates = slice.filter((card) => !drawn.has(makeCardId(card.statement.id, card.hiddenSlot)));
    if (candidates.length === 0) {
      // Slice exhausted: un-exclude just this (band, pack) slice so its cards are
      // eligible again (the "refill"). Binned live, so a card that drifted out of
      // the band since it was drawn belongs to whichever slice now owns it, not here.
      for (const card of slice) drawn.delete(makeCardId(card.statement.id, card.hiddenSlot));
      candidates = slice;
    }

    const card = candidates[Math.floor(rng() * candidates.length)] as Card;
    const cardId = makeCardId(card.statement.id, card.hiddenSlot);
    drawn.add(cardId);
    return {
      card,
      scheduler: { ...scheduler, difficultyBag, packBag, drawn: [...drawn], current: cardId },
    };
  }
  throw new Error(`no eligible cards in packs: ${included.join(", ") || "(none)"}`);
}

/**
 * Applies a new pack selection, and doubles as the restore reconciler. A
 * deselected pack's marbles are removed from the pack bag and its cards dropped
 * from `drawn` (and from `current`); a newly included pack's marbles are
 * appended so it is drawable on the very next draw — the mechanism that
 * dissolves the only-flag-questions bug. The difficulty bag is untouched: a
 * selection change alters *which* cards are eligible, not the difficulty mix.
 *
 * As reconciler it also drops any drawn id (or a `current`) that no longer
 * resolves in the graph — a card removed since the state was saved.
 */
export function applySelection(
  graph: Pack,
  scheduler: Scheduler,
  included: readonly string[],
): Scheduler {
  const packs = new Set(included);
  const wasIncluded = new Set(scheduler.included);

  // Keep the marbles of packs still selected; append one cycle's worth of
  // marbles for each newly included pack at the draw end (pop side), so it comes
  // up next rather than after the current cycle drains.
  const kept = scheduler.packBag.filter((pack) => packs.has(pack));
  const added: string[] = [];
  for (const pack of included) {
    if (wasIncluded.has(pack)) continue;
    for (let i = 0; i < (scheduler.packRatio[pack] ?? 1); i++) added.push(pack);
  }

  const resolves = (cardId: string): boolean => {
    try {
      return packs.has(findCard(graph, cardId).statement.pack);
    } catch {
      return false; // Card no longer in the graph, or its pack deselected — drop it.
    }
  };
  const drawn = scheduler.drawn.filter(resolves);
  const current = scheduler.current !== null && resolves(scheduler.current) ? scheduler.current : null;

  return { ...scheduler, included: [...included], packBag: [...kept, ...added], drawn, current };
}

/**
 * Records that `cardId` was answered: clears `current` (when it is that card) so
 * the next `/question` draws afresh, and ensures the card is in `drawn` so a
 * pass does not re-serve it. Called by the server's `/answer` path.
 */
export function markAnswered(scheduler: Scheduler, cardId: string): Scheduler {
  const drawn = scheduler.drawn.includes(cardId) ? scheduler.drawn : [...scheduler.drawn, cardId];
  const current = scheduler.current === cardId ? null : scheduler.current;
  return { ...scheduler, drawn, current };
}
