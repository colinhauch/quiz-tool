import { enumerateCards, makeCardId } from "./card.js";
import { createGraph } from "./graph.js";
import type { HiddenSlot, Pack, RenderedQuestion, Statement } from "./types.js";

/** A statement is quizzable when its relation has a generator. */
function isQuizzable(pack: Pack, statement: Statement): boolean {
  return statement.relation in pack.generators;
}

/**
 * Runs the pack's generator for a statement's relation, hiding `hiddenSlot`,
 * and wraps the result with a stable card identifier. The engine owns the
 * card identity; the generator owns the prompt.
 */
export function generateQuestion(
  pack: Pack,
  statement: Statement,
  hiddenSlot: HiddenSlot,
): RenderedQuestion {
  const generator = pack.generators[statement.relation];
  if (!generator) throw new Error(`no generator for relation: ${statement.relation}`);

  const content = generator({ statement, hiddenSlot, graph: createGraph(pack.entities) });
  return { cardId: makeCardId(statement.id, hiddenSlot), prompt: content.prompt, input: content.input };
}

/**
 * Picks a random quizzable card and renders it. A card is a statement paired
 * with one of the hidden slots its relation supports, so a bidirectional
 * relation contributes two cards (object- and subject-hidden) and each is drawn
 * with equal weight. There is no scheduler; selection is a uniform random draw.
 * `rng` is injected so selection is deterministic under test.
 */
export function selectQuestion(pack: Pack, rng: () => number = Math.random): RenderedQuestion {
  const cards = enumerateCards(pack).filter((card) => isQuizzable(pack, card.statement));
  if (cards.length === 0) throw new Error("no quizzable statements in pack");

  const card = cards[Math.floor(rng() * cards.length)];
  if (!card) throw new Error("card selection out of range");

  return generateQuestion(pack, card.statement, card.hiddenSlot);
}
