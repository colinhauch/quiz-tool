import type { Generator } from "@geo/engine";

/**
 * Question generators for this pack's relations. The engine hands each a
 * statement and which slot to hide; the generator owns how the fact becomes a
 * prompt. MVP ships one: object-hidden `located_in` ("What country is X in?").
 */
const locatedIn: Generator = ({ statement, graph }) => {
  const city = graph.getEntity(statement.subject);
  return { prompt: `What country is ${city.labels.en} in?`, input: "text" };
};

export const generators: Record<string, Generator> = {
  located_in: locatedIn,
};

/**
 * The directory this pack's data files live in, so a loader can read
 * `entities.jsonl` / `statements.jsonl` off local disk. Resolves against the
 * source location under tsx/vitest, which is how the MVP runs.
 */
export const packDir = new URL(".", import.meta.url);
