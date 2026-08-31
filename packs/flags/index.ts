import { type Generator, displayNoun } from "@geo/engine";

/**
 * Question generator for country→flag `flag` statements. Subject-hidden only
 * (the manifest declares `hiddenSlots: ["subject"]`): the flag object is what
 * the card shows, so it is never the slot to guess — "This is the flag of what
 * country?" (name the country). The engine derives the flag image on the prompt
 * from the statement's `image` object literal (see `packages/engine/src/question.ts`);
 * this generator owns only the text.
 *
 * The noun ("country") is not hard-coded: it comes from the hidden subject's
 * type via `displayNoun`, so the same global `flag` relation can later phrase
 * "…what state?" for a US-state-flags pack whose entities are typed `usState`,
 * with no change here — just a registry entry (spec #180). Relation ids are
 * global, so `flag` must not collide with another pack's (#38); found by
 * convention, the loader imports this `index.ts` (ADR-0001).
 */
const flag: Generator = ({ statement, graph }) => {
  const subject = graph.getEntity(statement.subject);
  return { prompt: `This is the flag of what ${displayNoun(subject)}?`, input: "text" };
};

export const generators: Record<string, Generator> = {
  flag,
};
