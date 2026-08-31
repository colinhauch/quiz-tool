import type { Entity, Pack, Statement } from "@geo/engine";
import { describe, expect, it } from "vitest";
import { getEntityDetail } from "./entityProjection.js";
import type { Ownership } from "./ownership.js";

function fixture(): Pack {
  const entities: Entity[] = [
    { id: "Q17", labels: { en: "Japan" }, aliases: { en: ["Nippon"] }, types: ["country"] },
    { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"], coordinate: { lat: 35.6, lon: 139.7 } },
    { id: "Q142", labels: { en: "France" }, types: ["country"] },
  ];
  const statements: Statement[] = [
    { id: "cc:tokyo-japan", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" }, pack: "core-cities" },
    { id: "cap:japan", subject: "Q17", relation: "capital", object: { kind: "entity", id: "Q1490" }, pack: "capital-cities" },
  ];
  return {
    entities: new Map(entities.map((e) => [e.id, e])),
    statements,
    generators: {},
    packs: new Map([
      ["core-geo", { id: "core-geo", labels: { en: "Core Geography" }, version: "1.0.0" }],
      ["core-cities", { id: "core-cities", labels: { en: "Core Cities" }, version: "0.0.1" }],
      ["capital-cities", { id: "capital-cities", labels: { en: "Capital Cities" }, version: "0.0.1" }],
    ]),
  };
}

function fixtureOwnership(): Ownership {
  return {
    entityOwner: new Map([
      ["Q17", "core-geo"],
      ["Q1490", "core-geo"],
      ["Q142", "core-geo"],
    ]),
    relationOwner: new Map([["located_in", "core-cities"], ["capital", "capital-cities"]]),
    conflicts: { duplicateEntityOwners: [], duplicateRelationDefinitions: [] },
  };
}

describe("getEntityDetail", () => {
  it("shows labels, aliases, types, owner pack, and coordinate", () => {
    const detail = getEntityDetail(fixture(), "Q1490", fixtureOwnership());
    expect(detail).toMatchObject({
      id: "Q1490",
      label: "Tokyo",
      aliases: [],
      types: ["city"],
      ownerPackId: "core-geo",
      ownerPackLabel: "Core Geography",
      coordinate: { lat: 35.6, lon: 139.7 },
    });
  });

  it("flattens en aliases and omits coordinate when absent", () => {
    const detail = getEntityDetail(fixture(), "Q17", fixtureOwnership());
    expect(detail!.aliases).toEqual(["Nippon"]);
    expect(detail!.coordinate).toBeUndefined();
  });

  it("lists every statement the entity is subject or object of, with its role", () => {
    const detail = getEntityDetail(fixture(), "Q1490", fixtureOwnership());
    const roles = detail!.statements.map((s) => ({ id: s.id, role: s.role }));
    expect(roles).toEqual(
      expect.arrayContaining([
        { id: "cc:tokyo-japan", role: "subject" },
        { id: "cap:japan", role: "object" },
      ]),
    );
    expect(detail!.statements).toHaveLength(2);
  });

  it("returns undefined for an unknown entity id", () => {
    expect(getEntityDetail(fixture(), "Q999999", fixtureOwnership())).toBeUndefined();
  });

  it("omits owner fields when ownership has no entry for the entity", () => {
    const emptyOwnership: Ownership = {
      entityOwner: new Map(),
      relationOwner: new Map(),
      conflicts: { duplicateEntityOwners: [], duplicateRelationDefinitions: [] },
    };
    const detail = getEntityDetail(fixture(), "Q142", emptyOwnership);
    expect(detail!.ownerPackId).toBeUndefined();
    expect(detail!.ownerPackLabel).toBeUndefined();
  });
});
