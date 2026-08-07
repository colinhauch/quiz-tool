/**
 * The pure domain: knowledge graph, question generation, answer matching.
 *
 * No IO ever lives here — no filesystem, no database, no HTTP. That purity is
 * what makes the engine unit-testable without a server or a database, and it
 * is enforced by keeping this package free of Node-native dependencies.
 */

export * from "./types.js";
export { createGraph } from "./graph.js";
export { makeCardId, findCard, enumerateCards, supportedSlots, type Card } from "./card.js";
export { generateQuestion } from "./question.js";
export {
  buildQueue,
  drawNext,
  applySelection,
  type Queue,
  type Rng,
} from "./queue.js";
export {
  normalizeAnswer,
  acceptedAnswers,
  matchesEntity,
  checkAnswer,
  type AnswerResult,
} from "./answer.js";
