import type { Entity, GraphQuery } from "./types.js";

/**
 * Wraps a pack's entity map in a read interface for generators. Lookups
 * assume valid data (a statement never references a missing entity, because
 * validation caught that at install) and throw loudly if that assumption
 * breaks, rather than defensively returning undefined.
 */
export function createGraph(entities: Map<string, Entity>): GraphQuery {
  return {
    getEntity(id) {
      const entity = entities.get(id);
      if (!entity) throw new Error(`unknown entity: ${id}`);
      return entity;
    },
  };
}
