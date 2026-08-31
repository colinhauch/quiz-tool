import type { Entity } from "./types.js";

/**
 * Entity type → the display noun a generator drops into a question, e.g.
 * "This is the flag of what **country**?". The registry is the single hinge that
 * lets one global `flag` relation phrase itself for any subject: a later "US
 * State Flags" pack quizzes the same relation and only needs its entities typed
 * `usState` plus one entry here (spec #180). Bare entity `types` are opaque
 * strings with no display form of their own, so the mapping lives here rather
 * than being guessed from the type id.
 */
const DISPLAY_NOUNS: Record<string, string> = {
  country: "country",
};

/**
 * The display noun for an entity, from the first of its `types` that the
 * registry knows. Throws when none is registered — a flag pack quizzing a type
 * with no noun is a missing registry entry, not a question we should render with
 * a raw type id in it. `entities` in the current graph carry exactly one type,
 * but this scans the list so a multi-typed entity still resolves.
 */
export function displayNoun(entity: Entity): string {
  for (const type of entity.types) {
    const noun = DISPLAY_NOUNS[type];
    if (noun) return noun;
  }
  throw new Error(
    `no display noun for entity ${entity.id} of type(s) [${entity.types.join(", ")}]; add one to DISPLAY_NOUNS`,
  );
}
