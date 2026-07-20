import type { HiddenSlot, Pack, Statement } from "./types.js";

/**
 * A card's stable identifier: the statement it draws from plus the slot the
 * question conceals. One place builds it so generation and answer-resolution
 * can never disagree on the format.
 */
export function makeCardId(statementId: string, hiddenSlot: HiddenSlot): string {
  return `${statementId}:${hiddenSlot}`;
}

/**
 * Resolves a card identifier back to its statement and hidden slot by matching
 * against the pack, rather than string-splitting an ID whose statement half may
 * itself contain colons (`cc:tokyo-japan`). MVP conceals the object only.
 */
export function findCard(pack: Pack, cardId: string): { statement: Statement; hiddenSlot: HiddenSlot } {
  for (const statement of pack.statements) {
    if (makeCardId(statement.id, "object") === cardId) {
      return { statement, hiddenSlot: "object" };
    }
  }
  throw new Error(`unknown card: ${cardId}`);
}
