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
  /** A map of the answer entity, when it carries a coordinate. Omitted otherwise. */
  revealVisual?: VisualAid;
}

/**
 * The reveal's visual aid for the entity whose label the reveal shows: a map of
 * that entity when it carries a coordinate, omitted otherwise. Its `label`
 * equals `acceptedAnswer` by construction, since both come from the same entity.
 */
function revealVisualFor(entity: Entity): VisualAid | undefined {
  if (!entity.coordinate) return undefined;
  return {
    renderer: "map",
    entityId: entity.id,
    lat: entity.coordinate.lat,
    lon: entity.coordinate.lon,
    label: entity.labels.en,
  };
}

/** Grades against `entity` as the shown answer, attaching its map when it has one. */
function gradeAgainst(correct: boolean, entity: Entity): AnswerResult {
  const result: AnswerResult = { correct, acceptedAnswer: entity.labels.en };
  const visual = revealVisualFor(entity);
  if (visual) result.revealVisual = visual;
  return result;
}

/**
 * Judges a typed answer against the card's hidden entity. The hidden slot names
 * which entity is the target: a subject-hidden card grades against the subject
 * (the country in "Bern is the capital of what country?"), an object-hidden card
 * against the object (the country in "what country is Tokyo in?"). Correct means
 * the input matches one of the target's names; the canonical label comes back
 * either way, so a wrong answer can still be shown what was expected. The reveal
 * also carries a map of the shown answer entity when it has a coordinate.
 *
 * Object-hidden grading is *any-of*: a fact can have several true answers — a
 * country with several official languages, each modeled as its own statement —
 * so the answer is correct if it matches the object of *any* statement sharing
 * this card's `(subject, relation)`, not only the statement the card drew from.
 * For a 1:1 relation (capital, continent) that set is a singleton, so behaviour
 * is unchanged. Subject-hidden stays single-target.
 */
export function checkAnswer(pack: Pack, cardId: string, input: string): AnswerResult {
  const { statement, hiddenSlot } = findCard(pack, cardId);
  const graph = createGraph(pack.entities);

  // Subject-hidden stays single-target; targetEntityId also enforces the
  // literal-object and unsupported-slot guards shared with object grading.
  if (hiddenSlot !== "object") {
    const target = graph.getEntity(targetEntityId(statement, hiddenSlot));
    return gradeAgainst(matchesEntity(input, target), target);
  }

  if (statement.object.kind !== "entity") {
    throw new Error(`card ${cardId} hides a literal object, unsupported in MVP`);
  }

  // Every true answer for this (subject, relation): match any of them. Literal
  // objects can't be graded in the MVP, so they're skipped as candidates.
  const siblings = pack.statements.filter(
    (s) => s.subject === statement.subject && s.relation === statement.relation,
  );
  for (const sibling of siblings) {
    if (sibling.object.kind !== "entity") continue;
    const candidate = graph.getEntity(sibling.object.id);
    if (matchesEntity(input, candidate)) {
      return gradeAgainst(true, candidate);
    }
  }

  // Wrong: reveal the card's own object as the expected answer.
  return gradeAgainst(false, graph.getEntity(statement.object.id));
}
