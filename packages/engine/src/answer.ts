import { findCard, targetEntityId } from "./card.js";
import { createGraph } from "./graph.js";
import type { Entity, Pack, VisualAid } from "./types.js";

/**
 * Folds a typed answer to its comparison form so surface differences a learner
 * shouldn't be punished for don't count against them: decompose and strip
 * combining diacritics (so "Sao Paulo" matches "São Paulo"), recompose (NFC),
 * lowercase, fold punctuation, collapse internal whitespace, and trim. No
 * edit-distance — a typo is wrong. Note the diacritic strip only folds marks
 * that decompose; letters with no canonical decomposition (ß, ø, ł, æ) are
 * left as-is, which the English-only MVP data never exercises.
 *
 * Punctuation folding is a fixed mark set, not all Unicode punctuation, so
 * distinct answers don't collapse: hyphens become spaces, then periods,
 * commas, and apostrophes (straight and curly) are dropped.
 */
export function normalizeAnswer(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/-/g, " ") // hyphens → space: "Port-au-Prince" ≈ "port au prince"
    .replace(/[.,'’]/g, "") // drop periods, commas, apostrophes (straight + curly)
    .replace(/\s+/g, " ")
    .trim();
}

/** Every string that names this entity: its label plus any display aliases. */
export function acceptedAnswers(entity: Entity): string[] {
  const aliases = entity.aliases ? Object.values(entity.aliases).flat() : [];
  return [entity.labels.en, ...aliases];
}

/** True when the input, normalized, is one of the entity's normalized names. */
export function matchesEntity(input: string, entity: Entity): boolean {
  const normalized = normalizeAnswer(input);
  return acceptedAnswers(entity).some((name) => normalizeAnswer(name) === normalized);
}

export interface AnswerResult {
  correct: boolean;
  /** The canonical label of the correct answer, for feedback. */
  acceptedAnswer: string;
  /** A map of the target entity, when it carries a coordinate. Omitted otherwise. */
  revealVisual?: VisualAid;
}

/**
 * Judges a typed answer against the card's hidden entity. The hidden slot names
 * which entity is the target: an object-hidden card grades against the object
 * (the country in "what country is Tokyo in?"), a subject-hidden card against
 * the subject (the country in "Bern is the capital of what country?"). Correct
 * means the input matches one of that entity's names; the canonical label comes
 * back either way, so a wrong answer can still be shown what was expected.
 */
export function checkAnswer(pack: Pack, cardId: string, input: string): AnswerResult {
  const { statement, hiddenSlot } = findCard(pack, cardId);
  const target = createGraph(pack.entities).getEntity(targetEntityId(statement, hiddenSlot));
  const result: AnswerResult = { correct: matchesEntity(input, target), acceptedAnswer: target.labels.en };
  if (target.coordinate) {
    result.revealVisual = {
      renderer: "map",
      entityId: target.id,
      lat: target.coordinate.lat,
      lon: target.coordinate.lon,
      label: target.labels.en,
    };
  }
  return result;
}
