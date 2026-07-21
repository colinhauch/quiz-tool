import { readFileSync } from "node:fs";
import type { Entity, Generator, Pack, Statement } from "@geo/engine";
import * as coreCities from "@geo/pack-core-cities";

/**
 * The one piece of pack IO in the system. The engine stays pure by never
 * touching disk; the server reads each active pack's data files here and hands
 * the engine one already-merged {@link Pack}. Adding a pack is a data change
 * behind this seam plus an entry in {@link installedPacks}, not an engine change.
 */

/** An installed pack: its data directory plus its question generators (code). */
interface InstalledPack {
  packDir: URL;
  generators: Record<string, Generator>;
}

/**
 * The packs this server build ships, keyed by pack id (the manifest `id`, which
 * also prefixes the pack's statement ids — that prefix is how provenance
 * survives the merge). Active selection is a subset of these keys.
 */
export const installedPacks: Record<string, InstalledPack> = {
  "core-cities": { packDir: coreCities.packDir, generators: coreCities.generators },
};

/** Parse a `.jsonl` file (one JSON object per line) relative to a pack dir. */
function readJsonl<T>(file: string, packDir: URL): T[] {
  const text = readFileSync(new URL(file, packDir), "utf8");
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

/**
 * Loads one installed pack from local disk: its entities and statements off
 * `.jsonl`, its generators from the pack's code. The runtime trusts the data,
 * per the validate-at-build/install discipline in `specs/packs/README.md`.
 */
export function loadPack(id: string): Pack {
  const pack = installedPacks[id];
  if (!pack) throw new Error(`unknown pack: ${id}`);
  const entities = new Map(readJsonl<Entity>("entities.jsonl", pack.packDir).map((e) => [e.id, e]));
  const statements = readJsonl<Statement>("statements.jsonl", pack.packDir);
  return { entities, statements, generators: pack.generators };
}

/**
 * Merges active packs into one graph: entities union by Q-ID (a shared node
 * collapses to one; a later pack wins on collision), statements concatenated,
 * generators combined into one relation→generator table. Question selection
 * then draws uniformly across the merged statements, so packs interweave.
 */
export function mergePacks(packs: Pack[]): Pack {
  const entities = new Map<string, Entity>();
  const statements: Statement[] = [];
  const generators: Record<string, Generator> = {};
  for (const pack of packs) {
    for (const [id, entity] of pack.entities) entities.set(id, entity);
    statements.push(...pack.statements);
    Object.assign(generators, pack.generators);
  }
  return { entities, statements, generators };
}

/**
 * The active pack ids. `config` is a comma-separated id list (from `GEO_PACKS`);
 * empty or undefined selects every installed pack. Selecting one, a subset, or
 * all is just the shape of this list.
 */
export function selectPacks(
  config: string | undefined,
  installed: string[] = Object.keys(installedPacks),
): string[] {
  const ids = (config ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return ids.length > 0 ? ids : installed;
}

/**
 * Loads and merges the active packs named by `GEO_PACKS` (default: all
 * installed). The server's one call to assemble the graph it serves.
 */
export function loadActivePacks(config: string | undefined = process.env.GEO_PACKS): Pack {
  return mergePacks(selectPacks(config).map(loadPack));
}

/** Loads just the fixture `core-cities` pack. Retained for existing callers. */
export function loadCoreCitiesPack(): Pack {
  return loadPack("core-cities");
}
