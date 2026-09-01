import type { LoadedPack } from "@geo/server/pack-loader";
import { describe, expect, it } from "vitest";
import { computeOwnership } from "./ownership.js";

/**
 * A minimal `LoadedPack` fixture. Only the fields `computeOwnership` reads
 * (`id`, `entities`, `manifest.relations`) are populated — the rest of
 * `LoadedPack` (dirName, dir, manifest.labels, statements, generators) is
 * irrelevant to ownership and omitted via a cast, mirroring how
 * `admin-app.test.ts`'s `fixturePack()` only fills what the graph reads.
 */
function loadedPack(partial: {
  id: string;
  entityIds?: string[];
  relations?: string[];
}): LoadedPack {
  return {
    id: partial.id,
    dirName: partial.id,
    dir: new URL(`file:///packs/${partial.id}/`),
    manifest: {
      id: partial.id,
      version: "0.0.1",
      labels: { en: partial.id },
      relations: Object.fromEntries(
        (partial.relations ?? []).map((r) => [r, { labels: { en: r } }]),
      ),
    },
    entities: new Map((partial.entityIds ?? []).map((eid) => [eid, { id: eid, labels: { en: eid }, types: [] }])),
    statements: [],
    generators: {},
  } as LoadedPack;
}

describe("computeOwnership", () => {
  it("attributes each entity to the one pack that ships it", () => {
    const packs = [
      loadedPack({ id: "core-geo", entityIds: ["Q1", "Q2"] }),
      loadedPack({ id: "currencies", entityIds: ["Q100"], relations: ["official_currency"] }),
    ];
    const ownership = computeOwnership(packs);
    expect(ownership.entityOwner.get("Q1")).toBe("core-geo");
    expect(ownership.entityOwner.get("Q100")).toBe("currencies");
    expect(ownership.entityOwner.get("Q999")).toBeUndefined();
  });

  it("attributes each relation to the pack that declares it", () => {
    const packs = [
      loadedPack({ id: "capital-cities", relations: ["capital"] }),
      loadedPack({ id: "core-geo", entityIds: ["Q1"] }),
    ];
    const ownership = computeOwnership(packs);
    expect(ownership.relationOwner.get("capital")).toBe("capital-cities");
    expect(ownership.relationOwner.get("unknown_relation")).toBeUndefined();
  });

  it("flags an entity id shipped by more than one pack as a conflict", () => {
    const packs = [
      loadedPack({ id: "pack-a", entityIds: ["Q1"] }),
      loadedPack({ id: "pack-b", entityIds: ["Q1"] }),
    ];
    const ownership = computeOwnership(packs);
    expect(ownership.conflicts.duplicateEntityOwners).toEqual([
      { entityId: "Q1", packIds: ["pack-a", "pack-b"] },
    ]);
  });

  it("flags a relation declared by more than one pack as a conflict", () => {
    const packs = [
      loadedPack({ id: "pack-a", relations: ["located_in"] }),
      loadedPack({ id: "pack-b", relations: ["located_in"] }),
    ];
    const ownership = computeOwnership(packs);
    expect(ownership.conflicts.duplicateRelationDefinitions).toEqual([
      { relationId: "located_in", packIds: ["pack-a", "pack-b"] },
    ]);
  });

  it("reports no conflicts for clean data", () => {
    const packs = [loadedPack({ id: "core-geo", entityIds: ["Q1"] })];
    const ownership = computeOwnership(packs);
    expect(ownership.conflicts.duplicateEntityOwners).toEqual([]);
    expect(ownership.conflicts.duplicateRelationDefinitions).toEqual([]);
  });
});
