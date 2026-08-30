import type { AdminEntityDetail, AdminEntityStatement } from "@geo/contract";
import type { Pack } from "@geo/engine";
import { resolveObjectSlot } from "./packProjection.js";
import type { Ownership } from "./ownership.js";

/**
 * The rich Entity view (#137): labels, aliases, types, every Statement it is
 * subject or object of (each resolved for graph traversal — see
 * `resolveObjectSlot`), its Owner pack, and its coordinate when present.
 * `undefined` for an id absent from the graph — the route turns that into 404
 * rather than the projection throwing.
 */
export function getEntityDetail(pack: Pack, entityId: string, ownership: Ownership): AdminEntityDetail | undefined {
  const entity = pack.entities.get(entityId);
  if (!entity) return undefined;

  const statements: AdminEntityStatement[] = [];
  for (const statement of pack.statements) {
    if (statement.subject === entityId) {
      statements.push({
        id: statement.id,
        relation: statement.relation,
        role: "subject",
        subject: { id: statement.subject, label: pack.entities.get(statement.subject)?.labels.en ?? statement.subject },
        object: resolveObjectSlot(pack, statement.object),
        packId: statement.pack,
      });
    } else if (statement.object.kind === "entity" && statement.object.id === entityId) {
      statements.push({
        id: statement.id,
        relation: statement.relation,
        role: "object",
        subject: { id: statement.subject, label: pack.entities.get(statement.subject)?.labels.en ?? statement.subject },
        object: resolveObjectSlot(pack, statement.object),
        packId: statement.pack,
      });
    }
  }

  const ownerPackId = ownership.entityOwner.get(entityId);
  const ownerPackLabel = ownerPackId ? pack.packs.get(ownerPackId)?.labels.en : undefined;

  return {
    id: entity.id,
    label: entity.labels.en,
    aliases: entity.aliases?.en ?? [],
    types: entity.types,
    ownerPackId,
    ownerPackLabel,
    coordinate: entity.coordinate,
    statements,
  };
}
