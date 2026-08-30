import type { AdminEntitySummary, AdminObjectSlot, AdminPackDetail, AdminPackSummary, AdminStatement } from "@geo/contract";
import { enumerateCards, type Entity, type ObjectSlot, type Pack } from "@geo/engine";
import type { Ownership } from "./ownership.js";

/** Renders an object slot for display, resolving an entity reference to its label. */
export function resolveObjectSlot(pack: Pack, object: ObjectSlot): AdminObjectSlot {
  if (object.kind === "literal") {
    const { literal } = object;
    return { kind: "literal", literal: String(literal.value) };
  }
  const entity = pack.entities.get(object.id);
  return { kind: "entity", entity: { id: object.id, label: entity?.labels.en ?? object.id } };
}

/** Renders a statement for display: subject and object resolved to navigable refs. */
export function toAdminStatement(pack: Pack, statement: Pack["statements"][number]): AdminStatement {
  const subjectEntity = pack.entities.get(statement.subject);
  return {
    id: statement.id,
    relation: statement.relation,
    subject: { id: statement.subject, label: subjectEntity?.labels.en ?? statement.subject },
    object: resolveObjectSlot(pack, statement.object),
    packId: statement.pack,
  };
}

function toEntitySummary(entity: Entity): AdminEntitySummary {
  return { id: entity.id, label: entity.labels.en, types: entity.types };
}

/**
 * Every discovered pack (ADR-0001), including catalog-hidden ones (ADR-0003) —
 * the admin ignores player-catalog visibility entirely. Row shape mirrors
 * #136's acceptance criteria: label, version, license, credits, Statement
 * count, Card count. `core-geo` (entities only, no statements) still gets a
 * row with zero counts rather than being filtered out, unlike the player-facing
 * `packListSchema` in `@geo/contract`'s `index.ts`.
 */
export function listPacks(pack: Pack): AdminPackSummary[] {
  const cardsByPack = new Map<string, number>();
  for (const card of enumerateCards(pack)) {
    const packId = card.statement.pack;
    cardsByPack.set(packId, (cardsByPack.get(packId) ?? 0) + 1);
  }
  const statementsByPack = new Map<string, number>();
  for (const statement of pack.statements) {
    statementsByPack.set(statement.pack, (statementsByPack.get(statement.pack) ?? 0) + 1);
  }

  return [...pack.packs.values()].map((info) => ({
    id: info.id,
    label: info.labels.en,
    version: info.version,
    license: info.license,
    credits: info.credits,
    statementCount: statementsByPack.get(info.id) ?? 0,
    cardCount: cardsByPack.get(info.id) ?? 0,
  }));
}

/**
 * A pack's Entities and Statements (#136): the entities this pack *owns*
 * (`ownership.entityOwner`, not merely references), and its statements grouped
 * by relation, each group flagged `definedHere` when this pack's manifest
 * declares the relation (`ownership.relationOwner`) and `definedBy` naming the
 * true owner otherwise — so an operator can tell "this pack's own vocabulary"
 * from "facts it asserts using someone else's relation".
 */
export function getPackDetail(pack: Pack, packId: string, ownership: Ownership): AdminPackDetail {
  const info = pack.packs.get(packId);
  if (!info) throw new Error(`unknown pack: ${packId}`);

  const entities = [...pack.entities.values()]
    .filter((entity) => ownership.entityOwner.get(entity.id) === packId)
    .map(toEntitySummary);

  const statementsByRelation = new Map<string, Pack["statements"]>();
  for (const statement of pack.statements) {
    if (statement.pack !== packId) continue;
    const group = statementsByRelation.get(statement.relation) ?? [];
    group.push(statement);
    statementsByRelation.set(statement.relation, group);
  }

  const relations = [...statementsByRelation.entries()].map(([relation, statements]) => {
    const owner = ownership.relationOwner.get(relation);
    const definedHere = owner === packId;
    return {
      relation,
      definedHere,
      definedBy: definedHere ? undefined : owner,
      statements: statements.map((statement) => toAdminStatement(pack, statement)),
    };
  });

  return {
    id: info.id,
    label: info.labels.en,
    version: info.version,
    license: info.license,
    credits: info.credits,
    entities,
    relations,
  };
}
