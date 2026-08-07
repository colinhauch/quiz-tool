import type { Generator } from "@geo/engine";

/**
 * Question generators for this pack's relations. The engine hands each a
 * statement and which slot to hide; the generator owns how the fact becomes a
 * prompt. MVP ships one: object-hidden `located_in` ("What country is X in?").
 *
 * This module is found by convention — the loader discovers the pack directory
 * and imports `index.ts` if it exists (ADR-0001), so nothing here needs to say
 * where the pack lives.
 */
const locatedIn: Generator = ({ statement, graph }) => {
  const city = graph.getEntity(statement.subject);
  return { prompt: `What country is ${city.labels.en} in?`, input: "text" };
};

export const generators: Record<string, Generator> = {
  located_in: locatedIn,
};
