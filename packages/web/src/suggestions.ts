import type { EntitySummary } from "@geo/contract";
import { normalizeAnswer } from "@geo/engine";
import { getEntities } from "./apiClient.js";

/**
 * How many characters a learner must type before answer suggestions appear. A
 * developer-facing knob for now, not a user setting: `1` means suggestions
 * start on the first keystroke and an empty box shows nothing. Raising it (say
 * to 3) would delay the list until more of the name is typed.
 */
export const MIN_CHARS_BEFORE_SUGGEST = 1;

/** The most suggestion rows offered at once, so a large type can't flood the UI. */
export const MAX_SUGGESTIONS = 8;

export interface SuggestOptions {
  minChars?: number;
  limit?: number;
}

/**
 * The entities whose names match what the learner has typed, ranked for
 * display. Both the input and each entity's names (its canonical label plus
 * every alias) are folded through the engine's `normalizeAnswer` before
 * comparison, so the list can never surface a spelling the grader would then
 * reject over case or accents — matching and grading share one normalizer.
 *
 * A name *containing* the typed text is a match (so "sili" finds "Brasília");
 * a name *starting with* it ranks above a mid-string match. Nothing appears
 * until `minChars` characters are typed. Order among equal-rank matches follows
 * the input entity order.
 */
export function filterSuggestions(
  input: string,
  entities: EntitySummary[],
  options: SuggestOptions = {},
): EntitySummary[] {
  const minChars = options.minChars ?? MIN_CHARS_BEFORE_SUGGEST;
  const limit = options.limit ?? MAX_SUGGESTIONS;
  const needle = normalizeAnswer(input);
  if (needle.length < minChars) return [];

  const prefix: EntitySummary[] = [];
  const substring: EntitySummary[] = [];
  for (const entity of entities) {
    const names = [entity.label, ...entity.aliases].map(normalizeAnswer);
    if (names.some((name) => name.startsWith(needle))) prefix.push(entity);
    else if (names.some((name) => name.includes(needle))) substring.push(entity);
  }
  return [...prefix, ...substring].slice(0, limit);
}

/**
 * The suggestion pool per entity type, fetched once per type per session and
 * held in module memory. Deliberately not persisted: a full page reload
 * re-fetches, so a change to the underlying data becomes visible on reload
 * rather than being pinned in storage. A failed fetch is not cached, so a later
 * question of the same type can retry.
 */
const entityCache = new Map<string, Promise<EntitySummary[]>>();

/**
 * Every entity to suggest for a question, given its `answerTypes`: the union of
 * each type's list, de-duplicated by id (an entity carrying two of the
 * question's types appears once). Types already cached are not re-fetched.
 */
export async function loadSuggestionEntities(types: string[]): Promise<EntitySummary[]> {
  const lists = await Promise.all(
    types.map((type) => {
      let pending = entityCache.get(type);
      if (!pending) {
        pending = getEntities(type).catch((err) => {
          entityCache.delete(type);
          throw err;
        });
        entityCache.set(type, pending);
      }
      return pending;
    }),
  );

  const byId = new Map<string, EntitySummary>();
  for (const list of lists) {
    for (const entity of list) byId.set(entity.id, entity);
  }
  return [...byId.values()];
}

/** Drops the in-memory cache. For tests that need a clean slate between cases. */
export function clearSuggestionCache(): void {
  entityCache.clear();
}
