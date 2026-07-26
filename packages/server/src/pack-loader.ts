import { existsSync, readFileSync } from "node:fs";
import type { Entity, Generator, Pack, Statement } from "@geo/engine";
import * as coreCities from "@geo/pack-core-cities";
import * as coreGeo from "@geo/pack-core-geo";

/**
 * The one piece of pack IO in the system. The engine stays pure by never
 * touching disk; the server reads every authored tranche's data files here and
 * hands the engine one already-assembled {@link Pack}.
 *
 * A "pack" is an authoring + versioning unit, not a runtime-selectable one:
 * everything authored is loaded into a single graph, always. There is no
 * active-set selection and no dependency resolution — per-topic *filtering of
 * what's quizzed* is a future query over the assembled graph, not a boundary
 * this loader enforces. See `specs/packs/README.md`.
 */

/** An authored tranche: its data directory plus its question generators (code). */
export interface Tranche {
  packDir: URL;
  generators: Record<string, Generator>;
}

/**
 * Every authored tranche this server ships. All are loaded, always. One tranche
 * owns the entities; others may ship only statements over those entities.
 * Adding a tranche is a data change behind this seam plus an entry here.
 */
export const tranches: Tranche[] = [
  // core-geo is entities-only: the sole owner of every shared geographic
  // entity (continents, countries, capitals, core cities). It ships no
  // statements and no generators, so it yields no questions on its own —
  // it supplies the identity other tranches' statements resolve against.
  { packDir: coreGeo.packDir, generators: {} },
  // core-cities ships only city→country `located_in` statements over
  // core-geo's entities (it owns none of its own).
  { packDir: coreCities.packDir, generators: coreCities.generators },
];

/**
 * Parse a `.jsonl` file (one JSON object per line) relative to a tranche dir,
 * returning `[]` when the file is absent — a statement-only tranche ships no
 * `entities.jsonl` and still loads.
 */
function readJsonl<T>(file: string, packDir: URL): T[] {
  const url = new URL(file, packDir);
  if (!existsSync(url)) return [];
  return readFileSync(url, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

/**
 * Loads one tranche from local disk: its entities and statements off `.jsonl`,
 * its generators from the tranche's code. The runtime trusts the data, per the
 * validate-at-build/install discipline in `specs/packs/README.md`.
 */
export function loadTranche(tranche: Tranche): Pack {
  const entities = new Map(readJsonl<Entity>("entities.jsonl", tranche.packDir).map((e) => [e.id, e]));
  const statements = readJsonl<Statement>("statements.jsonl", tranche.packDir);
  return { entities, statements, generators: tranche.generators };
}

/**
 * Assembles authored tranches into one graph: statements concatenated and
 * generators merged into one relation→generator table, with each entity owned
 * by exactly one tranche. Entities are *not* unioned across tranches — a Q-ID
 * appearing in two tranches is an authoring error, not a silent collapse — so
 * statement-only tranches resolve against the single owner. Question selection
 * then draws uniformly across the merged statements, so tranches interweave.
 */
export function assembleGraph(packs: Pack[]): Pack {
  const entities = new Map<string, Entity>();
  const statements: Statement[] = [];
  const generators: Record<string, Generator> = {};
  for (const pack of packs) {
    for (const [id, entity] of pack.entities) {
      if (entities.has(id)) throw new Error(`entity ${id} is owned by more than one tranche`);
      entities.set(id, entity);
    }
    statements.push(...pack.statements);
    Object.assign(generators, pack.generators);
  }
  return { entities, statements, generators };
}

/**
 * Loads and assembles every authored tranche into the single graph the server
 * serves. The server's one call to build its content.
 */
export function loadAllPacks(): Pack {
  return assembleGraph(tranches.map(loadTranche));
}
