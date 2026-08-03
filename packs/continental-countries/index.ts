import type { Generator } from "@geo/engine";

/**
 * Question generator for country→continent `located_in_continent` statements.
 * Object-hidden: "What continent is X in?"
 *
 * The relation is deliberately NOT `located_in`: that id is core-cities'
 * city→country relation (`specs/knowledge-graph/statements.md` pins it to that
 * orientation), and relation ids are global — a pack defines new relations, it
 * never redefines someone else's (`specs/packs/README.md`). Sharing the id made
 * the two packs' generators collide in the loader's relation→generator table
 * and every city question render as a continent question (#38).
 */
const locatedInContinent: Generator = ({ statement, graph }) => {
  const country = graph.getEntity(statement.subject);
  return { prompt: `What continent is ${country.labels.en} in?`, input: "text" };
};

export const generators: Record<string, Generator> = {
  located_in_continent: locatedInContinent,
};

/**
 * The directory this pack's data files live in, so a loader can read
 * `statements.jsonl` off local disk. Resolves against the source location
 * under tsx/vitest, which is how the MVP runs.
 */
export const packDir = new URL(".", import.meta.url);
