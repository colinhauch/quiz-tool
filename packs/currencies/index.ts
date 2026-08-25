import type { Generator } from "@geo/engine";

/**
 * Question generator for country→currency `official_currency` statements.
 * Object-hidden only: "What currency does {country} use?" (name the currency).
 *
 * A country with several legal tenders is several statements, one per currency;
 * the engine grades object-hidden any-of, so any true currency for the country
 * counts (see `packages/engine/src/answer.ts`, #98). Aliases — including the
 * ISO 4217 code carried on the currency entity — grade correct too.
 *
 * Its own relation id, `official_currency`; relation ids are global, so it must
 * not collide with another pack's (#38). Found by convention: the loader
 * discovers the pack directory and imports this `index.ts` (ADR-0001).
 */
const officialCurrency: Generator = ({ statement, graph }) => {
  const country = graph.getEntity(statement.subject);
  return { prompt: `What currency does ${country.labels.en} use?`, input: "text" };
};

export const generators: Record<string, Generator> = {
  official_currency: officialCurrency,
};
