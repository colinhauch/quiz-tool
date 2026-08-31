import { describe, expect, it } from "vitest";
import {
  abilityKey,
  abilityOf,
  applyAnswer,
  difficultyOf,
  emptyRatings,
  kFactor,
  PROVISIONAL_ANSWERS,
  probabilityOfSuccess,
  type RatingEvent,
  type Ratings,
  replay,
  SEED_RATING,
  SETTLED_K,
  PROVISIONAL_K,
} from "./rating.js";

/**
 * The pure Elo rating engine (spec #118, ticket #119). Every assertion here is
 * external behaviour at the seam: a probability from two ratings, the K a
 * card's answer count implies, how one answer moves difficulty and ability, and
 * that replaying a log rebuilds the same tables. No IO, no DB — the whole point
 * of the seam.
 */

describe("probabilityOfSuccess", () => {
  it("is 0.5 when difficulty equals ability", () => {
    expect(probabilityOfSuccess(1500, 1500)).toBeCloseTo(0.5, 12);
  });

  it("rises as ability outstrips difficulty (400 points => ~0.909)", () => {
    expect(probabilityOfSuccess(1500, 1900)).toBeCloseTo(1 / 1.1, 12);
  });

  it("falls as difficulty outstrips ability (400 points => ~0.091)", () => {
    expect(probabilityOfSuccess(1900, 1500)).toBeCloseTo(0.1 / 1.1, 12);
  });

  it("is symmetric about the gap", () => {
    expect(probabilityOfSuccess(1500, 1700) + probabilityOfSuccess(1700, 1500)).toBeCloseTo(1, 12);
  });
});

describe("kFactor", () => {
  it("is provisional for a card's first answers", () => {
    expect(kFactor(0)).toBe(PROVISIONAL_K);
    expect(kFactor(PROVISIONAL_ANSWERS - 1)).toBe(PROVISIONAL_K);
  });

  it("settles once the card has been answered enough", () => {
    expect(kFactor(PROVISIONAL_ANSWERS)).toBe(SETTLED_K);
    expect(kFactor(PROVISIONAL_ANSWERS + 50)).toBe(SETTLED_K);
  });
});

const event = (over: Partial<RatingEvent> = {}): RatingEvent => ({
  cardId: "cc:tokyo-japan:object",
  learnerId: "learner-a",
  correct: true,
  ...over,
});

describe("applyAnswer", () => {
  it("seeds unseen card and pack at 1500", () => {
    const r = emptyRatings();
    expect(difficultyOf(r, "cc:tokyo-japan:object")).toBe(SEED_RATING);
    expect(abilityOf(r, "learner-a", "capital-cities")).toBe(SEED_RATING);
  });

  it("a correct answer raises ability and lowers difficulty by the same amount", () => {
    // Seed vs seed => P=0.5, provisional K=40, delta = 40*(1-0.5) = 20.
    const { ratings } = applyAnswer(emptyRatings(), event({ correct: true }), "capital-cities");
    expect(abilityOf(ratings, "learner-a", "capital-cities")).toBeCloseTo(1520, 9);
    expect(difficultyOf(ratings, "cc:tokyo-japan:object")).toBeCloseTo(1480, 9);
  });

  it("a wrong answer lowers ability and raises difficulty by the same amount", () => {
    const { ratings } = applyAnswer(emptyRatings(), event({ correct: false }), "capital-cities");
    expect(abilityOf(ratings, "learner-a", "capital-cities")).toBeCloseTo(1480, 9);
    expect(difficultyOf(ratings, "cc:tokyo-japan:object")).toBeCloseTo(1520, 9);
  });

  it("snapshots the pre-answer ratings, K, and owning pack", () => {
    const { snapshot } = applyAnswer(emptyRatings(), event(), "capital-cities");
    expect(snapshot).toEqual({
      difficulty: SEED_RATING,
      ability: SEED_RATING,
      kApplied: PROVISIONAL_K,
      packId: "capital-cities",
    });
  });

  it("counts each answer against the card globally and settles K after the threshold", () => {
    let r = emptyRatings();
    const snapshots: number[] = [];
    for (let i = 0; i < PROVISIONAL_ANSWERS + 1; i++) {
      // Alternate learners: the count that drives K is the CARD's, not a learner's.
      const learnerId = i % 2 === 0 ? "learner-a" : "learner-b";
      const applied = applyAnswer(r, event({ learnerId }), "capital-cities");
      snapshots.push(applied.snapshot?.kApplied ?? -1);
      r = applied.ratings;
    }
    // First PROVISIONAL_ANSWERS answers provisional; the next one settled.
    expect(snapshots.slice(0, PROVISIONAL_ANSWERS).every((k) => k === PROVISIONAL_K)).toBe(true);
    expect(snapshots[PROVISIONAL_ANSWERS]).toBe(SETTLED_K);
  });

  it("difficulty is global across learners; ability is per learner+pack", () => {
    let r = emptyRatings();
    r = applyAnswer(r, event({ learnerId: "learner-a", correct: true }), "capital-cities").ratings;
    r = applyAnswer(r, event({ learnerId: "learner-b", correct: true }), "capital-cities").ratings;
    // Both correct answers pushed the one card's difficulty down twice.
    expect(difficultyOf(r, "cc:tokyo-japan:object")).toBeLessThan(1480);
    // Each learner has their own ability for the pack.
    expect(abilityOf(r, "learner-a", "capital-cities")).toBeGreaterThan(SEED_RATING);
    expect(abilityOf(r, "learner-b", "capital-cities")).toBeGreaterThan(SEED_RATING);
    expect(abilityKey("learner-a", "capital-cities")).not.toBe(abilityKey("learner-b", "capital-cities"));
  });

  it("scores 0 with no rating change when the card has no owning pack (edge not in graph)", () => {
    const r = emptyRatings();
    const { ratings, snapshot } = applyAnswer(r, event({ correct: false }), undefined);
    expect(snapshot).toBeNull();
    expect(difficultyOf(ratings, "cc:tokyo-japan:object")).toBe(SEED_RATING);
    expect(abilityOf(ratings, "learner-a", "capital-cities")).toBe(SEED_RATING);
    expect(ratings).toEqual(r);
  });
});

describe("replay", () => {
  const owner = (cardId: string): string | undefined =>
    cardId.startsWith("cc:") ? "capital-cities" : undefined;

  const log: RatingEvent[] = [
    { cardId: "cc:tokyo-japan:object", learnerId: "a", correct: true },
    { cardId: "cc:paris-france:object", learnerId: "a", correct: false },
    { cardId: "cc:tokyo-japan:object", learnerId: "b", correct: false },
  ];

  it("reconstructs identical tables from the same log (deterministic)", () => {
    const first = replay(log, owner);
    const second = replay(log, owner);
    expect(first).toEqual(second);
  });

  it("equals folding applyAnswer by hand", () => {
    let r: Ratings = emptyRatings();
    for (const e of log) r = applyAnswer(r, e, owner(e.cardId)).ratings;
    expect(replay(log, owner)).toEqual(r);
  });

  it("is order-sensitive", () => {
    const reordered = [log[2], log[0], log[1]] as RatingEvent[];
    expect(replay(log, owner)).not.toEqual(replay(reordered, owner));
  });

  it("ignores answers whose card has no owning pack", () => {
    const withOrphan: RatingEvent[] = [...log, { cardId: "gone:1:object", learnerId: "a", correct: true }];
    expect(replay(withOrphan, owner)).toEqual(replay(log, owner));
  });
});
