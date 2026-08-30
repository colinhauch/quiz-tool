import type { HiddenSlot, Pack, Statement } from "./types.js";

/**
 * A card's stable identifier: the statement it draws from plus the slot the
 * question conceals. One place builds it so generation and answer-resolution
 * can never disagree on the format.
 */
export function makeCardId(statementId: string, hiddenSlot: HiddenSlot): string {
  return `${statementId}:${hiddenSlot}`;
}

/** A quizzable unit: a statement paired with the slot the question conceals. */
export interface Card {
  statement: Statement;
  hiddenSlot: HiddenSlot;
}

/**
 * The id of the entity a card's hidden slot conceals — the answer's identity.
 * An object-hidden card targets the object (the country in "what country is
 * Tokyo in?"), a subject-hidden card the subject. One place derives this so
 * grading and answer-type exposure can never disagree on which entity is the
 * answer. A hidden literal object has no entity to name and is unsupported.
 */
export function targetEntityId(statement: Statement, hiddenSlot: HiddenSlot): string {
  if (hiddenSlot === "subject") return statement.subject;
  if (hiddenSlot === "object") {
    if (statement.object.kind !== "entity") {
      throw new Error(`card ${makeCardId(statement.id, hiddenSlot)} hides a literal object, unsupported in MVP`);
    }
    return statement.object.id;
  }
  throw new Error(`card ${makeCardId(statement.id, hiddenSlot)} hides ${hiddenSlot}, unsupported in MVP`);
}

/**
 * Which hidden slots a relation can be quizzed on. Declared per-relation by the
 * pack (`pack.hiddenSlots`); a relation that declares nothing is object-hidden
 * only, the MVP default. Both selection and card-resolution read this, so a
 * relation cannot be selectable on a slot it can't be resolved back from.
 */
export function supportedSlots(pack: Pack, relation: string): HiddenSlot[] {
  return pack.hiddenSlots?.[relation] ?? ["object"];
}

/**
 * Every card the pack can express: each statement paired with each hidden slot
 * its relation supports. Selection and card-resolution both read this single
 * enumeration so they can't disagree on which cards exist. It does not filter
 * on whether a relation has a generator — resolution must find a recorded card
 * even when it isn't currently selectable — so callers that want only quizzable
 * cards (selection) filter on the generator themselves.
 */
export function enumerateCards(pack: Pack): Card[] {
  const cards: Card[] = [];
  for (const statement of pack.statements) {
    for (const hiddenSlot of supportedSlots(pack, statement.relation)) {
      cards.push({ statement, hiddenSlot });
    }
  }
  return cards;
}

/**
 * Resolves a card identifier back to its statement and hidden slot by matching
 * against the pack's cards, rather than string-splitting an ID whose statement
 * half may itself contain colons (`cc:tokyo-japan`). A subject-hidden card
 * resolves as readily as an object-hidden one.
 */
export function findCard(pack: Pack, cardId: string): Card {
  for (const card of enumerateCards(pack)) {
    if (makeCardId(card.statement.id, card.hiddenSlot) === cardId) {
      return card;
    }
  }
  throw new Error(`unknown card: ${cardId}`);
}
