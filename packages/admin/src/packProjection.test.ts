import type { Entity, Pack, Statement } from "@geo/engine";
import { describe, expect, it } from "vitest";
import { getPackDetail, listPacks } from "./packProjection.js";
import type { Ownership } from "./ownership.js";

/**
 * A small multi-pack graph mirroring the real shape: `core-geo` owns the
 * entities and defines no relation, `capital-cities` defines `capital` (both
 * hidden slots — a bidirectional relation) and asserts statements against
 * core-geo's entities, and `unquizzed-pack` has a statement whose relation has
 * no generator (mirrors what #139 must show as non-quizzable).
 */
function fixture(): Pack {
  const entities: Entity[] = [
    { id: "Q17", labels: { en: "Japan" }, types: ["country"] },
    { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] },
  ];
  const statements: Statement[] = [
    { id: "cap:japan", subject: "Q17", relation: "capital", object: { kind: "entity", id: "Q1490" }, pack: "capital-cities" },
    { id: "unq:japan", subject: "Q17", relation: "unquizzed", object: { kind: "entity", id: "Q1490" }, pack: "unquizzed-pack" },
  ];
  return {
    entities: new Map(entities.map((e) => [e.id, e])),
    statements,
    generators: {
      capital: ({ statement, graph }) => ({
        prompt: `What is the capital of ${graph.getEntity(statement.subject).labels.en}?`,
        input: "text",
      }),
    },
    hiddenSlots: { capital: ["object", "subject"] },
    packs: new Map([
      ["core-geo", { id: "core-geo", labels: { en: "Core Geography" }, version: "1.0.0", license: "CC0-1.0" }],
      ["capital-cities", { id: "capital-cities", labels: { en: "Capital Cities" }, version: "0.0.1" }],
      ["unquizzed-pack", { id: "unquizzed-pack", labels: { en: "Unquizzed" }, version: "0.0.1" }],
    ]),
  };
}

function fixtureOwnership(): Ownership {
  return {
    entityOwner: new Map([
      ["Q17", "core-geo"],
      ["Q1490", "core-geo"],
    ]),
    relationOwner: new Map([["capital", "capital-cities"]]),
    conflicts: { duplicateEntityOwners: [], duplicateRelationDefinitions: [] },
  };
}

describe("listPacks", () => {
  it("lists every pack, including an entity-only one with no statements or cards", () => {
    const summaries = listPacks(fixture());
    expect(summaries.find((s) => s.id === "core-geo")).toEqual({
      id: "core-geo",
      label: "Core Geography",
      version: "1.0.0",
      license: "CC0-1.0",
      credits: undefined,
      statementCount: 0,
      cardCount: 0,
    });
  });

  it("counts statements and cards per pack, honoring bidirectional hiddenSlots", () => {
    const summaries = listPacks(fixture());
    const capitalCities = summaries.find((s) => s.id === "capital-cities")!;
    expect(capitalCities.statementCount).toBe(1);
    // "capital" supports both object- and subject-hidden slots, so one
    // statement yields two cards.
    expect(capitalCities.cardCount).toBe(2);
  });

  it("counts a card for an unquizzable statement's default object slot even with no generator", () => {
    // enumerateCards does not filter on generator presence; card *existence*
    // is independent of whether the relation is currently quizzable (#139
    // shows those as non-quizzable rather than making them disappear here).
    const summaries = listPacks(fixture());
    const unquizzed = summaries.find((s) => s.id === "unquizzed-pack")!;
    expect(unquizzed.statementCount).toBe(1);
    expect(unquizzed.cardCount).toBe(1);
  });
});

describe("getPackDetail", () => {
  it("lists the entities this pack owns and groups statements by relation", () => {
    const detail = getPackDetail(fixture(), "capital-cities", fixtureOwnership());
    expect(detail.entities).toEqual([]); // capital-cities owns no entities
    expect(detail.relations).toEqual([
      {
        relation: "capital",
        definedHere: true,
        definedBy: undefined,
        statements: [
          {
            id: "cap:japan",
            relation: "capital",
            subject: { id: "Q17", label: "Japan" },
            object: { kind: "entity", entity: { id: "Q1490", label: "Tokyo" } },
            packId: "capital-cities",
          },
        ],
      },
    ]);
  });

  it("marks a relation as asserted (not defined-here) when another pack owns it", () => {
    // unquizzed-pack has a statement using "unquizzed", which no pack's
    // manifest declares in this fixture (ownership map has no entry for it) —
    // it should show as not-defined-here with no known owner named.
    const detail = getPackDetail(fixture(), "unquizzed-pack", fixtureOwnership());
    expect(detail.relations[0]!.definedHere).toBe(false);
    expect(detail.relations[0]!.definedBy).toBeUndefined();
  });

  it("lists the entities core-geo owns", () => {
    const detail = getPackDetail(fixture(), "core-geo", fixtureOwnership());
    expect(detail.entities.map((e) => e.id).sort()).toEqual(["Q1490", "Q17"]);
    expect(detail.relations).toEqual([]);
  });
});
