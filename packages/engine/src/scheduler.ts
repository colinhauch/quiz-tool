import { type Card, enumerateCards, findCard, makeCardId } from "./card.js";
import { type Ratings, abilityOf, difficultyOf, probabilityOfSuccess } from "./rating.js";
import type { Pack } from "./types.js";

/**
 * The bag-of-bags scheduler (spec `specs/learning/scheduler.md`, ticket #120).
 * It replaces the provisional Question Queue (`queue.ts`) as the thing that
 * decides which **card** to ask next.
 *
 * Selection stays *random* while *guaranteeing a difficulty distribution*, by
 * nesting two shuffle bags over the Elo ratings from #119:
 *
 * - The **top bag** holds tier *marbles* in a fixed ratio (see {@link Tier}).
 *   Drawn without replacement, the ratio is honoured *exactly* per cycle, not
 *   just in expectation — that is the difficulty-mix knob.
 * - Each **inner bag** holds the eligible cards whose `P(success)` falls in its
 *   tier's band. Also drawn without replacement, so a cycle gives coverage and
 *   no within-cycle repeats.
 *
 * A draw picks a marble (say "medium"), then a card from that tier's bag. A
 * brand-new card is seeded at `D = θ = 1500`, so `P(success) = 0.5` and it lands
 * in the medium tier — that *is* the new-card introduction, no separate lane.
 *
 * Everything here is pure and RNG-injected, in the mould of `queue.ts` and
 * `rating.ts`: ratings and a scheduler go in, a card and a new scheduler come
 * out. The server owns the one live instance, the randomness, and the rating
 * tables; the engine owns what a draw *is*. Tiers, thresholds, and the ratio are
 * parameters with sane defaults ({@link DEFAULT_TIERS}), left tunable.
 */

/** Random source, injected so every ordering decision is deterministic under test. */
export type Rng = () => number;

/**
 * A difficulty tier: a `P(success)` band and how many marbles it puts in the top
 * bag per cycle. The band is `[min, max)` — half-open so the tiers partition
 * `[0, 1]` with no card falling in two (give the top tier a `max` above 1 so a
 * perfect `P = 1` still lands somewhere). `marbles` is the tier's share of the
 * difficulty mix: a cycle draws exactly `marbles` cards from this tier.
 */
export interface Tier {
  readonly name: string;
  /** `P(success)` lower bound, inclusive. */
  readonly min: number;
  /** `P(success)` upper bound, exclusive. */
  readonly max: number;
  /** How many of this tier's cards a full top-bag cycle draws. */
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
 * The scheduler's whole mutable-by-replacement state.
 *
 * `included` is carried on the scheduler so it is self-describing, exactly as
 * the queue carried it: re-selecting compares against the packs *this* scheduler
 * was built from. `topBag` and `bags` hold what is *left* in the current draw —
 * marbles yet to be drawn this cycle, and cards yet to be drawn from each tier.
 * Both drain as cards are handed out and refill (top bag) or re-bin (inner bag)
 * when empty.
 */
export interface Scheduler {
  /** Pack ids the eligible pool is drawn from. Never empty. */
  readonly included: readonly string[];
  /** The tier configuration — bands and ratio. Carried so a draw is self-describing. */
  readonly tiers: readonly Tier[];
  /** Tier names still to be drawn this cycle. Refills to the full ratio when empty. */
  readonly topBag: readonly string[];
  /** Tier name → card ids still to be drawn from it. Re-bins from the pool when empty. */
  readonly bags: Readonly<Record<string, readonly string[]>>;
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
function eligiblePool(graph: Pack, included: readonly string[]): Card[] {
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

/** `P(success)` for a card: its difficulty against the learner's ability for its owning pack. */
function successProbability(ratings: Ratings, learnerId: string, card: Card): number {
  const cardId = makeCardId(card.statement.id, card.hiddenSlot);
  const difficulty = difficultyOf(ratings, cardId);
  const ability = abilityOf(ratings, learnerId, card.statement.pack);
  return probabilityOfSuccess(difficulty, ability);
}

/**
 * Bins the current eligible pool into one card-id list per tier by each card's
 * `P(success)`. Unrated cards read back at the seed, so they compute `P = 0.5`
 * and land in whichever tier owns 0.5 (medium, by default). Lists come back
 * unshuffled; callers shuffle the bags they build from these.
 */
function binPool(
  graph: Pack,
  ratings: Ratings,
  learnerId: string,
  included: readonly string[],
  tiers: readonly Tier[],
): Record<string, string[]> {
  const bins: Record<string, string[]> = Object.fromEntries(tiers.map((t) => [t.name, []]));
  for (const card of eligiblePool(graph, included)) {
    const tier = tierOf(tiers, successProbability(ratings, learnerId, card));
    if (tier) bins[tier.name]?.push(makeCardId(card.statement.id, card.hiddenSlot));
  }
  return bins;
}

/** A fresh, shuffled top bag holding each tier's `marbles` count — the full cycle. */
function fillTopBag(tiers: readonly Tier[], rng: Rng): string[] {
  const marbles: string[] = [];
  for (const tier of tiers) {
    for (let i = 0; i < tier.marbles; i++) marbles.push(tier.name);
  }
  return shuffle(marbles, rng);
}

/**
 * A fresh scheduler: the whole eligible pool binned by `P(success)`, each inner
 * bag shuffled, the top bag filled to the ratio and shuffled.
 *
 * Throws on a selection that yields no eligible cards — an empty pack list, or
 * packs shipping nothing quizzable. Like `buildQueue`, this is the backstop that
 * keeps "the learner is being quizzed on nothing" from ever being a silent state.
 */
export function buildScheduler(
  graph: Pack,
  ratings: Ratings,
  learnerId: string,
  included: readonly string[],
  rng: Rng = Math.random,
  tiers: readonly Tier[] = DEFAULT_TIERS,
): Scheduler {
  const bins = binPool(graph, ratings, learnerId, included, tiers);
  if (eligiblePool(graph, included).length === 0) {
    throw new Error(`no eligible cards in packs: ${included.join(", ") || "(none)"}`);
  }
  const bags: Record<string, readonly string[]> = {};
  for (const tier of tiers) bags[tier.name] = shuffle(bins[tier.name] ?? [], rng);
  return { included: [...included], tiers, topBag: fillTopBag(tiers, rng), bags };
}

/**
 * Draws the next card: a marble from the top bag picks a tier, then that tier's
 * inner bag gives a card.
 *
 * The top bag refills (a new cycle) when empty. When a *drawn* tier's inner bag
 * is empty it is re-binned from the **current** eligible pool and ratings —
 * which have drifted as answers arrived — and **only that bag**; the others are
 * untouched and the pool is not reshuffled. If it is still empty (the learner
 * genuinely has no eligible card in that band) another marble is drawn. Re-draws
 * are allowed: there is no within-session exclusion in v1.
 *
 * Throws only if the pool is truly empty — every tier re-bins to nothing — which
 * the selection contract (never an empty included set) is meant to prevent.
 */
export function drawNext(
  graph: Pack,
  ratings: Ratings,
  learnerId: string,
  scheduler: Scheduler,
  rng: Rng = Math.random,
): { card: Card; scheduler: Scheduler } {
  const { included, tiers } = scheduler;
  const topBag = [...scheduler.topBag];
  const bags: Record<string, string[]> = {};
  for (const name of Object.keys(scheduler.bags)) bags[name] = [...(scheduler.bags[name] ?? [])];

  // At most this many marble draws before we conclude the pool is empty: a full
  // fresh cycle's worth. Each iteration either returns a card or discards a
  // marble from a genuinely (even after re-bin) empty tier.
  let budget = tiers.reduce((n, t) => n + t.marbles, 0);
  while (budget-- > 0) {
    if (topBag.length === 0) topBag.push(...fillTopBag(tiers, rng));
    const tierName = topBag.pop() as string;

    if ((bags[tierName]?.length ?? 0) === 0) {
      // Re-bin only this tier from the current pool and drifted ratings.
      bags[tierName] = shuffle(binPool(graph, ratings, learnerId, included, tiers)[tierName] ?? [], rng);
    }
    const bag = bags[tierName] ?? [];
    if (bag.length === 0) continue; // Still empty — redraw a different marble.

    const cardId = bag.pop() as string;
    return { card: findCard(graph, cardId), scheduler: { included, tiers, topBag, bags } };
  }
  throw new Error(`no eligible cards in packs: ${included.join(", ") || "(none)"}`);
}

/**
 * Applies a new pack selection. Deselecting a pack **stops its cards
 * immediately**: they are dropped from every inner bag now, not on the next
 * re-bin. A newly included pack is *not* shuffled in here — its cards are picked
 * up the next time a bag re-bins from the pool, which is the scheduler's
 * equivalent of the queue's fold-in. The top bag (the difficulty ratio) is
 * untouched: a selection change alters *which* cards are eligible, not the mix.
 */
export function applySelection(
  graph: Pack,
  scheduler: Scheduler,
  included: readonly string[],
): Scheduler {
  const packs = new Set(included);
  const bags: Record<string, readonly string[]> = {};
  for (const name of Object.keys(scheduler.bags)) {
    bags[name] = (scheduler.bags[name] ?? []).filter((cardId) => {
      try {
        return packs.has(findCard(graph, cardId).statement.pack);
      } catch {
        return false; // Card no longer in the graph — drop it.
      }
    });
  }
  return { included: [...included], tiers: scheduler.tiers, topBag: scheduler.topBag, bags };
}
