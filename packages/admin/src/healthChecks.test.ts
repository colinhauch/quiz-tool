import type { Entity, Pack, Statement } from "@geo/engine";
import { describe, expect, it } from "vitest";
import { computeGraphHealth } from "./healthChecks.js";
import type { Ownership } from "./ownership.js";

function emptyOwnership(): Ownership {
  return {
    entityOwner: new Map(),
    relationOwner: new Map(),
    conflicts: { duplicateEntityOwners: [], duplicateRelationDefinitions: [] },
  };
}

function findCheck(report: ReturnType<typeof computeGraphHealth>, id: string) {
  const check = report.checks.find((c) => c.id === id);
  if (!check) throw new Error(`missing check: ${id}`);
  return check;
}

describe("computeGraphHealth", () => {
  it("flags an entity that appears in no statement as orphaned", () => {
    const entities: Entity[] = [
      { id: "Q1", labels: { en: "Used" }, types: [] },
      { id: "Q2", labels: { en: "Orphan" }, types: [] },
    ];
    const statements: Statement[] = [
      { id: "s1", subject: "Q1", relation: "r", object: { kind: "literal", literal: { datatype: "string", value: "x" } }, pack: "p" },
    ];
    const pack: Pack = {
      entities: new Map(entities.map((e) => [e.id, e])),
      statements,
      generators: { r: () => ({ prompt: "p", input: "text" }) },
      packs: new Map([["p", { id: "p", labels: { en: "P" }, version: "0.0.1" }]]),
    };
    const check = findCheck(computeGraphHealth(pack, emptyOwnership()), "orphaned-entities");
    expect(check.count).toBe(1);
    expect(check.items).toEqual([{ targetType: "entity", targetId: "Q2", detail: expect.stringContaining("no statement") }]);
  });

  it("flags a statement whose relation has no generator as uncovered", () => {
    const entities: Entity[] = [{ id: "Q1", labels: { en: "A" }, types: [] }];
    const statements: Statement[] = [
      { id: "s1", subject: "Q1", relation: "ungenerated", object: { kind: "literal", literal: { datatype: "string", value: "x" } }, pack: "p" },
    ];
    const pack: Pack = {
      entities: new Map(entities.map((e) => [e.id, e])),
      statements,
      generators: {},
      packs: new Map([["p", { id: "p", labels: { en: "P" }, version: "0.0.1" }]]),
    };
    const check = findCheck(computeGraphHealth(pack, emptyOwnership()), "uncovered-statements");
    expect(check.count).toBe(1);
    expect(check.items[0]).toMatchObject({ targetType: "statement", targetId: "s1", packId: "p" });
  });

  it("flags an entity missing both coordinate and any visual-aid basis", () => {
    const entities: Entity[] = [
      { id: "Q1", labels: { en: "Has coord" }, types: [], coordinate: { lat: 1, lon: 1 } },
      { id: "Q2", labels: { en: "No coord" }, types: [] },
    ];
    const pack: Pack = {
      entities: new Map(entities.map((e) => [e.id, e])),
      statements: [],
      generators: {},
      packs: new Map([["p", { id: "p", labels: { en: "P" }, version: "0.0.1" }]]),
    };
    const check = findCheck(computeGraphHealth(pack, emptyOwnership()), "missing-visual-aid");
    expect(check.count).toBe(1);
    expect(check.items[0]).toMatchObject({ targetType: "entity", targetId: "Q2" });
  });

  it("flags a duplicate relation definition and a conflicting entity owner from the ownership map", () => {
    const pack: Pack = {
      entities: new Map(),
      statements: [],
      generators: {},
      packs: new Map(),
    };
    const ownership: Ownership = {
      entityOwner: new Map(),
      relationOwner: new Map(),
      conflicts: {
        duplicateEntityOwners: [{ entityId: "Q1", packIds: ["a", "b"] }],
        duplicateRelationDefinitions: [{ relationId: "r", packIds: ["x", "y"] }],
      },
    };
    const report = computeGraphHealth(pack, ownership);
    const dup = findCheck(report, "duplicate-ownership");
    expect(dup.count).toBe(2);
    expect(dup.items).toEqual(
      expect.arrayContaining([
        { targetType: "entity", targetId: "Q1", detail: expect.stringContaining("a") },
        { targetType: "statement", targetId: "r", detail: expect.stringContaining("x") },
      ]),
    );
  });

  it("reports zero counts for a clean graph", () => {
    const entities: Entity[] = [{ id: "Q1", labels: { en: "A" }, types: [], coordinate: { lat: 0, lon: 0 } }];
    const statements: Statement[] = [
      { id: "s1", subject: "Q1", relation: "r", object: { kind: "literal", literal: { datatype: "string", value: "x" } }, pack: "p" },
    ];
    const pack: Pack = {
      entities: new Map(entities.map((e) => [e.id, e])),
      statements,
      generators: { r: () => ({ prompt: "p", input: "text" }) },
      packs: new Map([["p", { id: "p", labels: { en: "P" }, version: "0.0.1" }]]),
    };
    const report = computeGraphHealth(pack, emptyOwnership());
    for (const check of report.checks) {
      expect(check.count).toBe(0);
      expect(check.items).toEqual([]);
    }
  });
});
