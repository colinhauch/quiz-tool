/**
 * The Elo/Rasch rating engine (spec `specs/learning/scheduler.md`, ticket #119).
 *
 * Two ratings, both on a 400-point scale seeded at 1500:
 *
 * - **Difficulty `D`** — per **card** (`statementId:hiddenSlot`), **global**:
 *   every learner's answers move it, because "name the capital of Chad" is hard
 *   for everyone. Keyed by card id.
 * - **Ability `θ`** — per **`(learner, pack)`**: a learner strong on capitals and
 *   weak on languages carries two abilities. Keyed by {@link abilityKey}.
 *
 * This module is pure and IO-free, in the mould of `queue.ts`: ratings go in,
 * new ratings come out. The server owns the live tables and the answer log; the
 * engine owns what a rating *is* and how one answer moves it. That keeps the
 * update rule and log replay testable without a server or a database.
 *
 * The tables are a cache — the append-only answer log is the source of truth.
 * {@link replay} folds a log back into identical tables, so changing K or the
 * formula reinterprets all history (the retroactivity principle in
 * `specs/learning/README.md`).
 */

import { findCard } from "./card.js";
import type { Pack } from "./types.js";

/** Points a 10× odds difference is worth. A calibration dial, not architecture. */
export const RATING_SCALE = 400;
/** Every unseen card and every unseen (learner, pack) starts here. */
export const SEED_RATING = 1500;
/** K while a card is still *provisional* — its difficulty moves fast. */
export const PROVISIONAL_K = 40;
/** K once a card has *settled* — its difficulty moves slowly. */
export const SETTLED_K = 20;
/** A card is provisional for this many answers, then settles. */
export const PROVISIONAL_ANSWERS = 10;

/**
 * Probability this learner answers this card correctly, from the Elo/Rasch
 * expectation. Higher difficulty lowers it; higher ability raises it; equal
 * ratings give 0.5.
 */
export function probabilityOfSuccess(difficulty: number, ability: number): number {
  return 1 / (1 + 10 ** ((difficulty - ability) / RATING_SCALE));
}

/**
 * The K-factor for an answer, taken from the **card's** prior answer count — not
 * the learner's. A fresh card moves both its own difficulty and the learner's
 * ability at the high provisional rate; once the card has been answered enough
 * to be trusted, both move slowly.
 */
export function kFactor(priorCardAnswerCount: number): number {
  return priorCardAnswerCount < PROVISIONAL_ANSWERS ? PROVISIONAL_K : SETTLED_K;
}

/**
 * The key an ability lives under. Ability is per-`(learner, pack)`, so both
 * halves are part of the key; a NUL separator can't collide with either id.
 */
export function abilityKey(learnerId: string, packId: string): string {
  return `${learnerId}\0${packId}`;
}

/**
 * The two rating tables. Difficulty and its per-card answer count are global;
 * ability is per-`(learner, pack)`. Maps are treated as immutable — every update
 * returns fresh ones, so a caller can never mutate rating state by reference.
 */
export interface Ratings {
  /** Card id → difficulty `D`. Absent means seed. */
  readonly difficulty: ReadonlyMap<string, number>;
  /** Card id → how many answers have moved this card. Drives {@link kFactor}. */
  readonly answerCount: ReadonlyMap<string, number>;
  /** {@link abilityKey} → ability `θ`. Absent means seed. */
  readonly ability: ReadonlyMap<string, number>;
}

/** Empty tables — everything reads back as the seed until an answer moves it. */
export function emptyRatings(): Ratings {
  return { difficulty: new Map(), answerCount: new Map(), ability: new Map() };
}

/** A card's difficulty, or the seed if it has never been answered. */
export function difficultyOf(ratings: Ratings, cardId: string): number {
  return ratings.difficulty.get(cardId) ?? SEED_RATING;
}

/** A learner's ability for a pack, or the seed if they've never been quizzed on it. */
export function abilityOf(ratings: Ratings, learnerId: string, packId: string): number {
  return ratings.ability.get(abilityKey(learnerId, packId)) ?? SEED_RATING;
}

/** One answer the rating engine consumes: which card, which learner, and the binary outcome. */
export interface RatingEvent {
  cardId: string;
  learnerId: string;
  /** True iff the learner's answer satisfied the asked card's hidden slot. */
  correct: boolean;
}

/**
 * What the scheduler believed the moment it asked, recorded per answer row. The
 * pre-answer difficulty and ability, the K it was about to apply, and the pack
 * the ability was read from. `P(success)` is deliberately absent — it is a pure
 * function of `difficulty` and `ability`. Null when the card has no owning pack.
 */
export interface RatingSnapshot {
  difficulty: number;
  ability: number;
  kApplied: number;
  packId: string;
}

/**
 * Applies one answer to the tables, returning the new tables and the ask-time
 * snapshot. Both the card's `D` and the owning pack's `θ` move by the same
 * magnitude in opposite directions — `θ += K·(actual − P)`, `D −= K·(actual − P)`
 * — so a correct answer makes the learner look abler and the card look easier by
 * an equal step (standard Elo; the spec's `new = old + K·(actual − P)` shorthand
 * describes the shared magnitude, with difficulty as the opponent's rating).
 *
 * `packId` is the pack that **owns** the card's statement (single-owner packs
 * make it unambiguous). `undefined` means the card resolves to no statement in
 * the current graph — an edge not in the graph: the answer scores 0, moves no
 * rating, and gets a null snapshot, because there is no valid card to rate.
 */
export function applyAnswer(
  ratings: Ratings,
  event: RatingEvent,
  packId: string | undefined,
): { ratings: Ratings; snapshot: RatingSnapshot | null } {
  if (packId === undefined) return { ratings, snapshot: null };

  const difficulty = difficultyOf(ratings, event.cardId);
  const ability = abilityOf(ratings, event.learnerId, packId);
  const priorCount = ratings.answerCount.get(event.cardId) ?? 0;
  const k = kFactor(priorCount);

  const actual = event.correct ? 1 : 0;
  const delta = k * (actual - probabilityOfSuccess(difficulty, ability));

  const nextDifficulty = new Map(ratings.difficulty).set(event.cardId, difficulty - delta);
  const nextAnswerCount = new Map(ratings.answerCount).set(event.cardId, priorCount + 1);
  const nextAbility = new Map(ratings.ability).set(abilityKey(event.learnerId, packId), ability + delta);

  return {
    ratings: { difficulty: nextDifficulty, answerCount: nextAnswerCount, ability: nextAbility },
    snapshot: { difficulty, ability, kApplied: k, packId },
  };
}

/**
 * The pack that owns a card's statement, or `undefined` if the card no longer
 * resolves against the graph (its statement is gone — an edge not in the graph).
 * The one place the server and {@link replay} agree on which `θ` a card reads and
 * updates; single-owner packs make the answer unambiguous.
 */
export function ownerPackId(pack: Pack, cardId: string): string | undefined {
  try {
    return findCard(pack, cardId).statement.pack;
  } catch {
    return undefined;
  }
}

/**
 * Rebuilds the rating tables by replaying a log in order. Deterministic and
 * order-sensitive — the same log always yields the same tables, and a different
 * order yields different ones. `ownerPackOf` maps a card id to its owning pack
 * (or `undefined` for a card no longer in the graph, which is skipped). This is
 * how a changed formula reinterprets all history.
 */
export function replay(
  events: readonly RatingEvent[],
  ownerPackOf: (cardId: string) => string | undefined,
): Ratings {
  let ratings = emptyRatings();
  for (const event of events) {
    ratings = applyAnswer(ratings, event, ownerPackOf(event.cardId)).ratings;
  }
  return ratings;
}
