import type { Entity, Pack, Statement } from "@geo/engine";

/**
 * The shared fixture graph for the cross-user (Track B) projections and route
 * tests — a superset of `admin-app.test.ts`'s `fixturePack()` with a second
 * pack, so pack-scoped filters/leaderboards have more than one value to
 * discriminate between.
 */
export const TEST_PACK_A = { id: "test-pack", labels: { en: "Test Pack" }, version: "0.0.1" };
export const TEST_PACK_B = { id: "other-pack", labels: { en: "Other Pack" }, version: "0.0.1" };

export function fixtureReadStorePack(): Pack {
  const entities: Entity[] = [
    { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] },
    { id: "Q17", labels: { en: "Japan" }, types: ["country"] },
    { id: "Q64", labels: { en: "Berlin" }, types: ["city"] },
    { id: "Q183", labels: { en: "Germany" }, types: ["country"] },
  ];
  const statements: Statement[] = [
    { id: "S1", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" }, pack: TEST_PACK_A.id },
    { id: "S2", subject: "Q64", relation: "capital_of", object: { kind: "entity", id: "Q183" }, pack: TEST_PACK_B.id },
  ];
  return {
    entities: new Map(entities.map((e) => [e.id, e])),
    statements,
    generators: {
      located_in: ({ statement, graph }) => ({
        prompt: `What country is ${graph.getEntity(statement.subject).labels.en} in?`,
        input: "text",
      }),
      capital_of: ({ statement, graph }) => ({
        prompt: `What is ${graph.getEntity((statement.object as { id: string }).id).labels.en}'s capital?`,
        input: "text",
      }),
    },
    packs: new Map([
      [TEST_PACK_A.id, TEST_PACK_A],
      [TEST_PACK_B.id, TEST_PACK_B],
    ]),
  };
}
