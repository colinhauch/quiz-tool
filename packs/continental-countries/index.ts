import type { Generator } from "@geo/engine";

/**
 * Question generator for country→continent `located_in_continent` statements.
 * Object-hidden: "What continent is X in?"
 *
 * Its own relation id, not `located_in`: that one is defined by `core-cities`
 * as city→country, and relation ids are global (#38).
 *
 * This module is found by convention — the loader discovers the pack directory
 * and imports `index.ts` if it exists (ADR-0001), so nothing here needs to say
 * where the pack lives.
 */
const locatedIn: Generator = ({ statement, graph }) => {
  const country = graph.getEntity(statement.subject);
  return { prompt: `What continent is ${country.labels.en} in?`, input: "text" };
};

export const generators: Record<string, Generator> = {
  located_in_continent: locatedIn,
};
