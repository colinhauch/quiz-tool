import { findCard, targetEntityId } from "./card.js";
import { createGraph } from "./graph.js";
import type { Entity, GraphQuery, Pack, Statement, VisualAid } from "./types.js";

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
  /**
   * Every canonical label the card accepts, for the reveal to show them all: a
   * transcontinental country returns `["Asia", "Europe"]`, a single-valued card
   * a one-element list. Deterministically ordered; `acceptedAnswer` is one of
   * these (the card's own object, or the matched one when correct).
   */
  acceptedAnswers: string[];
  /**
   * A map of the card's place, when an entity carries a coordinate. Its `label`
   * names the *pinned* place, which is not always `acceptedAnswer`: for "What
   * continent is Andorra in?" the map pins Andorra, not Europe. The pin and the
   * outlined country can differ — "What is the capital of Germany?" pins Berlin
   * yet outlines Germany (spec #203, see `revealVisualFor`).
   */
  revealVisual?: VisualAid;
}

/**
 * The reveal map for a card: a pin (point + label) at the most point-like
 * entity, plus — independently — the country's real outline drawn around it
 * when the statement names a country with a precomputed boundary (spec #203).
 * So "What is the capital of Germany?" pins Berlin *and* outlines Germany; the
 * pin marks the specific place, the boundary teaches the country's shape.
 *
 * The pin and the geographic context can be different entities. The point,
 * label, and `entityId` are always the pin's. The geometry — `boundaryGeoJSON`
 * and the coastline pair `localGeoJSON`/`regionExtent` — comes from the boundary
 * country when there is one (so the coastline overlay and the client's framing
 * match the outline), otherwise from the pin entity itself (a city with its own
 * clipped neighbourhood, or a country whose boundary is a seam-crosser fallback).
 */
function revealVisualFor(statement: Statement, graph: GraphQuery): VisualAid | undefined {
  const pin = mapEntityFor(statement, graph);
  if (!pin?.coordinate) return undefined;
  // Prefer the boundary country as the source of map geometry; fall back to the
  // pin's own so behaviour is unchanged for cards with no country boundary.
  const geoSource = boundaryCountryFor(statement, graph) ?? pin;
  const visual: VisualAid = {
    kind: "map",
    entityId: pin.id,
    lat: pin.coordinate.lat,
    lon: pin.coordinate.lon,
    label: pin.labels.en,
  };
  // Regional geometry rides along when the source was clipped at import (#154);
  // a source with no stored geometry still maps, just at the world silhouette —
  // the client falls back to full-world framing.
  if (geoSource.localGeoJSON) visual.localGeoJSON = geoSource.localGeoJSON;
  if (geoSource.regionExtent) visual.regionExtent = geoSource.regionExtent;
  // The country outline (#203); present only when a boundary country was found.
  if (geoSource.boundaryGeoJSON) visual.boundaryGeoJSON = geoSource.boundaryGeoJSON;
  return visual;
}

/**
 * How point-like a type is, for picking which of a card's entities the reveal
 * map depicts. A city pins a spot, a country a region, a continent barely a
 * place at all — so we prefer the most specific. Unknown types rank last.
 */
const LOCATABILITY: readonly string[] = ["city", "country", "continent"];
function locatabilityRank(entity: Entity): number {
  return Math.min(
    ...entity.types.map((t) => {
      const i = LOCATABILITY.indexOf(t);
      return i < 0 ? LOCATABILITY.length : i;
    }),
  );
}

/**
 * The entity the reveal map should show for a card: the most point-like of the
 * statement's subject and object that carries a coordinate — the specific place
 * is the memory hook, whichever slot the question hides. So "What continent is
 * Andorra in?" pins Andorra (not Europe), and "Moscow is the capital of what
 * country?" pins Moscow (not Russia's centroid). Undefined when neither end has
 * a coordinate (e.g. a currency or language object).
 */
/** The statement's subject and (entity) object that the graph actually holds —
 * an id it can't resolve simply drops out rather than failing the answer. */
function statementEntities(statement: Statement, graph: GraphQuery): Entity[] {
  const ids = [statement.subject];
  if (statement.object.kind === "entity") ids.push(statement.object.id);
  const out: Entity[] = [];
  for (const id of ids) {
    try {
      out.push(graph.getEntity(id));
    } catch {
      // unresolved id — not plottable, skip
    }
  }
  return out;
}

/**
 * A country in the statement that carries a precomputed boundary (spec #203),
 * so its outline can be drawn around the pin whichever entity the pin marks.
 * At most one country appears in the current relations, so the first match
 * wins. Undefined when no country in the statement has a boundary (the pin's
 * own geometry is then used, unchanged).
 */
function boundaryCountryFor(statement: Statement, graph: GraphQuery): Entity | undefined {
  return statementEntities(statement, graph).find(
    (e) => e.types.includes("country") && e.boundaryGeoJSON !== undefined,
  );
}

function mapEntityFor(statement: Statement, graph: GraphQuery): Entity | undefined {
  const located = statementEntities(statement, graph).filter((e) => e.coordinate);
  if (located.length === 0) return undefined;
  return located.reduce((best, e) => (locatabilityRank(e) < locatabilityRank(best) ? e : best));
}

/**
 * Judges a typed answer against the card's hidden entity. The hidden slot names
 * which entity is the target: a subject-hidden card grades against the subject
 * (the country in "Bern is the capital of what country?"), an object-hidden card
 * against the object (the country in "what country is Tokyo in?"). Correct means
 * the input matches one of the target's names; the canonical label comes back
 * either way, so a wrong answer can still be shown what was expected. The reveal
 * carries a map of the card's most locatable entity (see `mapEntityFor`) — the
 * place, not necessarily the answer.
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

  // The map depicts the card's place, independent of which slot is graded.
  const revealVisual = revealVisualFor(statement, graph);
  const finish = (correct: boolean, acceptedAnswer: string, acceptedAnswers: string[]): AnswerResult => {
    const result: AnswerResult = { correct, acceptedAnswer, acceptedAnswers };
    if (revealVisual) result.revealVisual = revealVisual;
    return result;
  };

  // Subject-hidden stays single-target; targetEntityId also enforces the
  // literal-object and unsupported-slot guards shared with object grading.
  if (hiddenSlot !== "object") {
    const target = graph.getEntity(targetEntityId(statement, hiddenSlot));
    return finish(matchesEntity(input, target), target.labels.en, [target.labels.en]);
  }

  if (statement.object.kind !== "entity") {
    throw new Error(`card ${cardId} hides a literal object, unsupported in MVP`);
  }

  // Every true answer for this (subject, relation): match any of them. Literal
  // objects can't be graded in the MVP, so they're skipped as candidates.
  const siblings = pack.statements.filter(
    (s) => s.subject === statement.subject && s.relation === statement.relation,
  );
  // All accepted labels, deduped and sorted, so the reveal can list them all.
  const acceptedAnswers = [
    ...new Set(
      siblings
        .filter((s) => s.object.kind === "entity")
        .map((s) => graph.getEntity((s.object as { id: string }).id).labels.en),
    ),
  ].sort((a, b) => a.localeCompare(b));

  for (const sibling of siblings) {
    if (sibling.object.kind !== "entity") continue;
    const candidate = graph.getEntity(sibling.object.id);
    if (matchesEntity(input, candidate)) {
      return finish(true, candidate.labels.en, acceptedAnswers);
    }
  }

  // Wrong: reveal the card's own object as the expected answer.
  return finish(false, graph.getEntity(statement.object.id).labels.en, acceptedAnswers);
}
