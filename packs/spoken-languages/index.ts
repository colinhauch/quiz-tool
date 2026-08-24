import type { Generator } from "@geo/engine";

/**
 * Question generator for country→language `spoken_language` statements.
 * Object-hidden only: "What is a language spoken in {country}?"
 *
 * The pack teaches what people actually speak in a place, not the legal status
 * of a language. Wikidata P37 (official language) is the baseline, then
 * overrides.json curates it editorially (add English for the US, drop
 * territorial-only entries). "A language", not "the": a country can have
 * several, modeled as several statements (Switzerland → four). Each is its own
 * card; any true answer grades correct via the engine's any-of grading over
 * statements sharing (subject, relation) (#98).
 *
 * Single-directional by design: only object-hidden. The reverse ("which country
 * speaks X?") has too many answers to grade, so it is deliberately not offered.
 *
 * Its own relation id, `spoken_language` — relation ids are global, so it must
 * not collide with another pack's (#38). Found by convention: the loader
 * discovers the pack directory and imports this `index.ts` (ADR-0001).
 */
const spokenLanguage: Generator = ({ statement, graph }) => {
  const country = graph.getEntity(statement.subject).labels.en;
  return { prompt: `What is a language spoken in ${country}?`, input: "text" };
};

export const generators: Record<string, Generator> = {
  spoken_language: spokenLanguage,
};
