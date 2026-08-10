import type { Generator } from "@geo/engine";

/**
 * Question generator for country→capital `capital` statements, quizzed both
 * ways (the manifest declares `hiddenSlots: ["object", "subject"]`):
 *
 * - object-hidden → "What is the capital of {country}?" (name the city)
 * - subject-hidden → "{city} is the capital of what country?" (name the country)
 *
 * One statement, two cards — the engine grades each against whichever slot is
 * hidden (see `packages/engine/src/answer.ts`). Its own relation id, `capital`;
 * relation ids are global, so it must not collide with another pack's (#38).
 *
 * Found by convention: the loader discovers the pack directory and imports this
 * `index.ts` if present (ADR-0001), so nothing here says where the pack lives.
 */
const capital: Generator = ({ statement, hiddenSlot, graph }) => {
  const country = graph.getEntity(statement.subject).labels.en;
  if (statement.object.kind !== "entity") {
    throw new Error(`capital expects an entity object for ${statement.id}`);
  }
  const city = graph.getEntity(statement.object.id).labels.en;
  return hiddenSlot === "subject"
    ? { prompt: `${city} is the capital of what country?`, input: "text" }
    : { prompt: `What is the capital of ${country}?`, input: "text" };
};

export const generators: Record<string, Generator> = {
  capital,
};
