import type { AdminGraphHealthReport, AdminHealthCheck, AdminHealthIssue } from "@geo/contract";
import type { Pack } from "@geo/engine";
import type { Ownership } from "./ownership.js";

function check(id: string, label: string, items: AdminHealthIssue[]): AdminHealthCheck {
  return { id, label, count: items.length, items };
}

/** Entities in no Statement, as either subject or object — dead weight in the graph. */
function orphanedEntities(pack: Pack): AdminHealthCheck {
  const referenced = new Set<string>();
  for (const statement of pack.statements) {
    referenced.add(statement.subject);
    if (statement.object.kind === "entity") referenced.add(statement.object.id);
  }
  const items: AdminHealthIssue[] = [...pack.entities.keys()]
    .filter((id) => !referenced.has(id))
    .map((id) => ({ targetType: "entity", targetId: id, detail: "in no statement" }));
  return check("orphaned-entities", "Orphaned entities", items);
}

/** Statements whose relation has no generator — no Card can ever be asked from them. */
function uncoveredStatements(pack: Pack): AdminHealthCheck {
  const items: AdminHealthIssue[] = pack.statements
    .filter((statement) => !pack.generators[statement.relation])
    .map((statement) => ({
      targetType: "statement",
      targetId: statement.id,
      packId: statement.pack,
      detail: `relation "${statement.relation}" has no generator`,
    }));
  return check("uncovered-statements", "Uncovered statements", items);
}

/** Entities with no coordinate — the only basis the engine has for a map visual aid today. */
function missingVisualAid(pack: Pack): AdminHealthCheck {
  const items: AdminHealthIssue[] = [...pack.entities.values()]
    .filter((entity) => !entity.coordinate)
    .map((entity) => ({ targetType: "entity", targetId: entity.id, detail: "no coordinate (no map visual aid)" }));
  return check("missing-visual-aid", "Missing coordinates / visual aid", items);
}

/**
 * Relations declared by more than one pack, and entities claimed by more than
 * one pack (CONTEXT.md's Owner rule: exactly one pack per entity). Reads
 * `ownership.conflicts`, computed from the raw per-pack sources — the
 * assembled graph itself can't tell, having already merged the conflict away.
 */
function duplicateOwnership(ownership: Ownership): AdminHealthCheck {
  const entityItems: AdminHealthIssue[] = ownership.conflicts.duplicateEntityOwners.map(({ entityId, packIds }) => ({
    targetType: "entity",
    targetId: entityId,
    detail: `owned by more than one pack: ${packIds.join(", ")}`,
  }));
  const relationItems: AdminHealthIssue[] = ownership.conflicts.duplicateRelationDefinitions.map(({ relationId, packIds }) => ({
    targetType: "statement",
    targetId: relationId,
    detail: `defined by more than one pack: ${packIds.join(", ")}`,
  }));
  return check("duplicate-ownership", "Duplicate relation definitions / conflicting owners", [
    ...entityItems,
    ...relationItems,
  ]);
}

/**
 * Every Graph Health check (#138), each a pure function over the assembled
 * `Pack` (plus `ownership`, for the one conflict check the merged graph can't
 * answer on its own). Each check carries a summary count and every failing
 * item, so the operator can drill from a count straight to the offending
 * Entity or Statement on the Packs surface.
 */
export function computeGraphHealth(pack: Pack, ownership: Ownership): AdminGraphHealthReport {
  return {
    checks: [orphanedEntities(pack), uncoveredStatements(pack), missingVisualAid(pack), duplicateOwnership(ownership)],
  };
}
