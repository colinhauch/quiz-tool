import type { LoadedPack } from "@geo/server/pack-loader";

/**
 * Admin-only ownership attribution, derived from the raw per-pack sources
 * rather than the assembled `Pack` graph. The assembled graph merges every
 * pack's entities into one `Map` and every relation's generator into one flat
 * `Record` — by design (`assembleGraph` in `@geo/server`), so the engine never
 * has to reason about provenance at runtime. That merge is exactly the
 * information Graph Health and the Packs surface need to show an Entity's
 * Owner (CONTEXT.md: "the single pack that defines a given entity") and which
 * pack defines a Relation, so this reads `LoadedPack[]` — the pre-merge
 * shape `@geo/server/pack-loader` already produces at boot — instead.
 *
 * Unlike `validatePacks` (`@geo/server/pack-validator`), this never throws: a
 * pack directory with two packs claiming one entity is exactly the state
 * Graph Health exists to surface, not to crash on.
 */
export interface Ownership {
  /** Entity id → the pack that first claims it (discovery order settles ties). */
  entityOwner: Map<string, string>;
  /** Relation id → the pack whose manifest declares it. */
  relationOwner: Map<string, string>;
  conflicts: {
    duplicateEntityOwners: { entityId: string; packIds: string[] }[];
    duplicateRelationDefinitions: { relationId: string; packIds: string[] }[];
  };
}

/** Builds the entity- and relation-ownership maps, and flags any conflicts. */
export function computeOwnership(packSources: readonly LoadedPack[]): Ownership {
  const entityOwner = new Map<string, string>();
  const entityClaimants = new Map<string, string[]>();
  for (const pack of packSources) {
    for (const [entityId] of pack.entities) {
      if (!entityOwner.has(entityId)) entityOwner.set(entityId, pack.id);
      entityClaimants.set(entityId, [...(entityClaimants.get(entityId) ?? []), pack.id]);
    }
  }

  const relationOwner = new Map<string, string>();
  const relationClaimants = new Map<string, string[]>();
  for (const pack of packSources) {
    for (const relationId of Object.keys(pack.manifest.relations ?? {})) {
      if (!relationOwner.has(relationId)) relationOwner.set(relationId, pack.id);
      relationClaimants.set(relationId, [...(relationClaimants.get(relationId) ?? []), pack.id]);
    }
  }

  const duplicateEntityOwners = [...entityClaimants]
    .filter(([, packIds]) => packIds.length > 1)
    .map(([entityId, packIds]) => ({ entityId, packIds }));
  const duplicateRelationDefinitions = [...relationClaimants]
    .filter(([, packIds]) => packIds.length > 1)
    .map(([relationId, packIds]) => ({ relationId, packIds }));

  return { entityOwner, relationOwner, conflicts: { duplicateEntityOwners, duplicateRelationDefinitions } };
}
