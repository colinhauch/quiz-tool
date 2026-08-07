import { existsSync, readFileSync, readdirSync } from "node:fs";
import type { Entity, Generator, LocalizedText, Pack, Statement } from "@geo/engine";

/**
 * The one piece of pack IO in the system. The engine stays pure by never
 * touching disk; the server finds every authored pack under `packs/`, reads its
 * data files here, and hands the engine one already-assembled graph.
 *
 * Packs are **discovered, not compiled in**: there is no list of packs in
 * application source, and no pack is a workspace package the server depends on.
 * Adding a pack is creating a directory with a `pack.json` — see
 * [ADR-0001](../../../docs/adr/0001-packs-are-discovered-not-compiled-in.md)
 * and `specs/packs/format.md`.
 *
 * A pack is an authoring + versioning unit, not a load-time-selectable one:
 * everything discovered is loaded into a single graph, always. Filtering *what
 * gets quizzed* is a draw-time query over the assembled graph, not a boundary
 * this loader enforces. See `specs/packs/README.md`.
 */

/**
 * Where packs live, relative to this module's source. Resolves correctly under
 * tsx/vitest, which is how the app runs; a compiled build would sit at a
 * different depth and need this passed in — which is why every entry point
 * below takes the directory as an argument.
 */
export const PACKS_DIR = new URL("../../../packs/", import.meta.url);

/** The files a pack may ship, all found by convention rather than declared. */
const MANIFEST = "pack.json";
const ENTITIES = "entities.jsonl";
const STATEMENTS = "statements.jsonl";
const GENERATORS = "index.ts";

/**
 * A pack's manifest. Only the fields something actually reads are typed here —
 * `contents`, `depends` and `engine_min_version` were removed precisely because
 * nothing read them and all three had drifted (see `specs/packs/format.md`).
 * `relations` is declared in the format spec and is read by the registry, which
 * is not built yet (#23); it is deliberately absent rather than typed-and-ignored.
 */
export interface PackManifest {
  id: string;
  version: string;
  labels: LocalizedText;
  descriptions?: LocalizedText;
  license?: string;
  credits?: { source: string; retrieved: string }[];
}

/** A pack directory found on disk: where its files live, plus its manifest. */
export interface PackSource {
  dir: URL;
  manifest: PackManifest;
}

/** The module a pack's optional `index.ts` exports: its question generators. */
interface GeneratorModule {
  generators?: Record<string, Generator>;
}

/**
 * Every pack directory under `packsDir`, in directory-name order. A directory
 * without a `pack.json` is not a pack and is skipped, so build output and
 * stray files can sit alongside without becoming content.
 *
 * Order is fixed only so that failures and logs read the same way twice —
 * assembly is order-independent by construction (entities have one owner, so
 * no load order can change the resulting graph).
 */
export function discoverPacks(packsDir: URL = PACKS_DIR): PackSource[] {
  return readdirSync(packsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => new URL(`${entry.name}/`, packsDir))
    .filter((dir) => existsSync(new URL(MANIFEST, dir)))
    .sort((a, b) => a.href.localeCompare(b.href))
    .map((dir) => ({ dir, manifest: JSON.parse(readFileSync(new URL(MANIFEST, dir), "utf8")) as PackManifest }));
}

/**
 * Parse a `.jsonl` file (one JSON object per line) relative to a pack dir,
 * returning `[]` when the file is absent — a statement-only pack ships no
 * `entities.jsonl` and still loads.
 */
function readJsonl<T>(file: string, dir: URL): T[] {
  const url = new URL(file, dir);
  if (!existsSync(url)) return [];
  return readFileSync(url, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

/**
 * Loads one discovered pack off local disk: its entities and statements from
 * `.jsonl`, its generators from `index.ts` if it has one. Every file is
 * optional — `core-geo` ships only entities and has no generator module at all.
 *
 * Async because generators are imported dynamically: a discovered pack is not
 * known at compile time, so there is nothing to `import` statically. The
 * runtime trusts what it reads; checking is the validator's job (#23).
 */
export async function loadPack(source: PackSource): Promise<Pack> {
  const entities = new Map(readJsonl<Entity>(ENTITIES, source.dir).map((e) => [e.id, e]));
  const statements = readJsonl<Statement>(STATEMENTS, source.dir);

  const generatorModule = new URL(GENERATORS, source.dir);
  const generators = existsSync(generatorModule)
    ? (((await import(generatorModule.href)) as GeneratorModule).generators ?? {})
    : {};

  return { entities, statements, generators };
}

/**
 * Assembles loaded packs into one graph: statements concatenated and generators
 * merged into one relation→generator table, with each entity owned by exactly
 * one pack. Entities are *not* unioned — a Q-ID appearing in two packs is an
 * authoring error, not a silent collapse — so statement-only packs resolve
 * against the single owner. Question selection then draws uniformly across the
 * merged statements, so packs **interweave**.
 *
 * Generators are still merged last-write-wins, which is how two packs both
 * claiming `located_in` silently broke every city question (#38). The registry
 * that makes that an error is #23; discovery deliberately lands with it.
 */
export function assembleGraph(packs: Pack[]): Pack {
  const entities = new Map<string, Entity>();
  const statements: Statement[] = [];
  const generators: Record<string, Generator> = {};
  for (const pack of packs) {
    for (const [id, entity] of pack.entities) {
      if (entities.has(id)) throw new Error(`entity ${id} is owned by more than one pack`);
      entities.set(id, entity);
    }
    statements.push(...pack.statements);
    Object.assign(generators, pack.generators);
  }
  return { entities, statements, generators };
}

/**
 * Discovers, loads and assembles every pack into the single graph the server
 * serves. The server's one call to build its content.
 */
export async function loadAllPacks(packsDir: URL = PACKS_DIR): Promise<Pack> {
  return assembleGraph(await Promise.all(discoverPacks(packsDir).map(loadPack)));
}
