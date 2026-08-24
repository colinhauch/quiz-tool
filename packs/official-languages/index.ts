import type { Generator } from "@geo/engine";

/**
 * Question generator for country→language `official_language` statements.
 * Object-hidden only: "What is an official language of {country}?"
 *
 * Deliberately "an", not "the": a country can have several official languages,
 * modeled as several statements (Switzerland → four). Each is its own card;
 * any true official language grades correct via the engine's any-of grading
 * over statements sharing (subject, relation) (#98).
 *
 * Its own relation id, `official_language` — relation ids are global, so it must
 * not collide with another pack's (#38). Found by convention: the loader
 * discovers the pack directory and imports this `index.ts` (ADR-0001).
 */
const officialLanguage: Generator = ({ statement, graph }) => {
  const country = graph.getEntity(statement.subject).labels.en;
  return { prompt: `What is an official language of ${country}?`, input: "text" };
};

export const generators: Record<string, Generator> = {
  official_language: officialLanguage,
};
