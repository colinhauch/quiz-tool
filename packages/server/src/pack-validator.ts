import type { HiddenSlot } from "@geo/engine";
import type { LoadedPack, RelationDeclaration } from "./pack-loader.js";

/**
 * The load-time pack validator, and the relation registry it produces.
 *
 * Everything here exists because discovery removed a safety net. When packs
 * were hand-wired, a broken pack failed at compile time inside a diff someone
 * was already reading. A scanned directory has no such review step, so the
 * checks that used to be "someone would notice" have to be real
 * ([ADR-0001](../../../docs/adr/0001-packs-are-discovered-not-compiled-in.md)).
 *
 * The rule this exists for first: **relation IDs are global, and redefinition
 * is an error.** That was documented from the first draft of `specs/packs/` and
 * enforced by nothing — generators were merged with `Object.assign`, last write
 * winning silently, which is how `core-cities` and `continental-countries` both
 * claiming `located_in` made every city question render as a continent question
 * (#38). A rename fixed that instance; this prevents the next one.
 *
 * Failures **throw**, and the loader does not catch. Skipping a bad pack with a
 * warning was considered and rejected: a warning in a scrollback is how a pack
 * quietly stops being quizzed.
 *
 * This runs once, at load. The engine never re-checks — validate at load, trust
 * thereafter (`specs/packs/README.md`).
 */

/** Question kinds the engine can grade. `multipleChoice` arrives with #43. */
const KNOWN_KINDS = new Set(["text"]);

/** Slots a card can conceal. Qualifier-hiding is reserved but unbuilt. */
const KNOWN_SLOTS = new Set<HiddenSlot>(["subject", "object"]);

/** One relation, and the pack that owns it. Ownership is what makes it global. */
export interface RegisteredRelation extends RelationDeclaration {
  /** The pack that declared it — named in the error when a second pack tries. */
  packId: string;
  /** Slots this relation can be quizzed on; `["object"]` when undeclared. */
  hiddenSlots: HiddenSlot[];
}

/** Every relation across every pack, keyed by relation id. */
export type RelationRegistry = Map<string, RegisteredRelation>;

/** Raised on any validation failure, so a caller can format it without parsing prose. */
export class PackValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`pack validation failed:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    this.name = "PackValidationError";
  }
}

/**
 * Builds the relation registry and checks every pack against it, collecting
 * *all* problems before throwing rather than failing on the first. An author
 * who has just written a pack wants the whole list, not one error per run.
 *
 * The checks are the ones in `specs/packs/format.md`. Deliberately absent:
 * `domain`/`range`/`cardinality`/`qualifier_schema` and anything reading them.
 * Those need a relation type system that does not exist, and declaring fields
 * before something reads them is exactly how `contents` and `depends` rotted
 * into three inconsistent conventions. Registry first, then declaration.
 */
export function validatePacks(packs: LoadedPack[]): RelationRegistry {
  const problems: string[] = [];
  const registry: RelationRegistry = new Map();

  // 1. Manifest identity. `id` has to match the directory, or an error naming
  //    the pack sends you to the wrong directory.
  const seenIds = new Map<string, string>();
  for (const pack of packs) {
    if (pack.manifest.id !== pack.dirName) {
      problems.push(`pack in directory "${pack.dirName}" declares id "${pack.manifest.id}"; they must match`);
    }
    if (!pack.manifest.labels?.en) problems.push(`pack "${pack.id}" has no labels.en`);
    const previous = seenIds.get(pack.manifest.id);
    if (previous) problems.push(`pack id "${pack.manifest.id}" is declared by both "${previous}" and "${pack.dirName}"`);
    seenIds.set(pack.manifest.id, pack.dirName);
  }

  // 2. Relation IDs are global. The check this whole file exists for.
  for (const pack of packs) {
    for (const [relationId, declaration] of Object.entries(pack.manifest.relations ?? {})) {
      const owner = registry.get(relationId);
      if (owner) {
        problems.push(
          `relation "${relationId}" is declared by both "${owner.packId}" and "${pack.id}"; relation ids are global`,
        );
        continue;
      }
      const hiddenSlots = declaration.hiddenSlots ?? ["object"];
      for (const slot of hiddenSlots) {
        if (!KNOWN_SLOTS.has(slot)) {
          problems.push(`relation "${relationId}" (${pack.id}) declares unknown hidden slot "${slot}"`);
        }
      }
      if (declaration.kind && !KNOWN_KINDS.has(declaration.kind)) {
        problems.push(`relation "${relationId}" (${pack.id}) declares unknown question kind "${declaration.kind}"`);
      }
      registry.set(relationId, { ...declaration, packId: pack.id, hiddenSlots });
    }
  }

  // 3/4. Declarations and generators have to agree, both ways. A declared
  //      relation with no generator is unquizzable; a generator nobody declared
  //      is code that will never run. Both used to be silent.
  for (const pack of packs) {
    const declared = new Set(Object.keys(pack.manifest.relations ?? {}));
    for (const relationId of declared) {
      if (!(relationId in pack.generators)) {
        problems.push(`pack "${pack.id}" declares relation "${relationId}" but ships no generator for it`);
      }
    }
    for (const relationId of Object.keys(pack.generators)) {
      if (!declared.has(relationId)) {
        problems.push(`pack "${pack.id}" ships a generator for "${relationId}" but does not declare it in pack.json`);
      }
    }
  }

  // 5. Every statement's relation is declared by *some* pack. A statement whose
  //    relation nobody declared used to be a silently-unquizzable row.
  const entityOwners = new Map<string, string>();
  const statementOwners = new Map<string, string>();
  for (const pack of packs) {
    for (const [id] of pack.entities) {
      const owner = entityOwners.get(id);
      // 6. No Q-ID owned by more than one pack.
      if (owner) problems.push(`entity ${id} is owned by both "${owner}" and "${pack.id}"`);
      else entityOwners.set(id, pack.id);
    }
  }
  for (const pack of packs) {
    for (const statement of pack.statements) {
      if (!registry.has(statement.relation)) {
        problems.push(`statement "${statement.id}" (${pack.id}) uses relation "${statement.relation}", which no pack declares`);
      }
      // 7. Statement IDs are unique across packs — statements never merge, so
      //    a clash is always an error, and cardIds would collide.
      const owner = statementOwners.get(statement.id);
      if (owner) problems.push(`statement id "${statement.id}" is used by both "${owner}" and "${pack.id}"`);
      else statementOwners.set(statement.id, pack.id);

      // 8. Entity references resolve. This is what lets the engine's
      //    getEntity throw on "impossible" rather than defend against it.
      if (!entityOwners.has(statement.subject)) {
        problems.push(`statement "${statement.id}" (${pack.id}) references subject ${statement.subject}, which no pack owns`);
      }
      if (statement.object.kind === "entity" && !entityOwners.has(statement.object.id)) {
        problems.push(`statement "${statement.id}" (${pack.id}) references object ${statement.object.id}, which no pack owns`);
      }
    }
  }

  if (problems.length > 0) throw new PackValidationError(problems);
  return registry;
}
