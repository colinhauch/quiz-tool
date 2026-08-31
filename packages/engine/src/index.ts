/**
 * The pure domain: knowledge graph, question generation, answer matching.
 *
 * No IO ever lives here — no filesystem, no database, no HTTP. That purity is
 * what makes the engine unit-testable without a server or a database, and it
 * is enforced by keeping this package free of Node-native dependencies.
 */

export * from "./types.js";
export { createGraph } from "./graph.js";
export { makeCardId, findCard, enumerateCards, supportedSlots, targetEntityId, type Card } from "./card.js";
export { generateQuestion } from "./question.js";
export {
  DEFAULT_TIERS,
  buildScheduler,
  drawNext,
  applySelection,
  eligibleCards,
  type Scheduler,
  type Tier,
  type Rng,
} from "./scheduler.js";
export {
  normalizeAnswer,
  acceptedAnswers,
  matchesEntity,
  checkAnswer,
  type AnswerResult,
} from "./answer.js";
export {
  RATING_SCALE,
  SEED_RATING,
  PROVISIONAL_K,
  SETTLED_K,
  PROVISIONAL_ANSWERS,
  probabilityOfSuccess,
  kFactor,
  abilityKey,
  emptyRatings,
  difficultyOf,
  abilityOf,
  applyAnswer,
  replay,
  ownerPackId,
  type Ratings,
  type RatingEvent,
  type RatingSnapshot,
} from "./rating.js";
