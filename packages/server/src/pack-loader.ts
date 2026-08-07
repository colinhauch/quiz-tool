import { existsSync, readFileSync, readdirSync } from "node:fs";
import type {
  Entity,
  Generator,
  HiddenSlot,
  LocalizedText,
  Pack,
  PackInfo,
  Statement,
} from "@geo/engine";
import { type RelationRegistry, validatePacks } from "./pack-validator.js";

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
 * One relation a pack defines. Declaring it here is what makes it real: the
 * registry is built from these, and an undeclared relation is an error rather
 * than a silently-unquizzable row.
 */
export interface RelationDeclaration {
  labels: LocalizedText;
  /** Which question kind grades it. Defaults to `text`; the closed set is #43. */
  kind?: string;
  /** Which slots it can be quizzed on. Defaults to `["object"]`, the MVP default. */
  hiddenSlots?: HiddenSlot[];
}

/**
 * A pack's manifest. Only fields something actually reads are typed here —
 * `contents`, `depends` and `engine_min_version` were removed precisely because
 * nothing read them and all three had drifted (see `specs/packs/format.md`).
 */
export interface PackManifest {
  id: string;
  version: string;
  labels: LocalizedText;
  descriptions?: LocalizedText;
  license?: string;
  credits?: { source: string; retrieved: string }[];
  /** Omitted entirely by a pack that defines no relations, like `core-geo`. */
  relations?: Record<string, RelationDeclaration>;
}

/** A pack directory found on disk: where its files live, plus its manifest. */
export interface PackSource {
  /** The directory name, kept separate from `manifest.id` so the two can be checked against each other. */
  dirName: string;
  dir: URL;
  manifest: PackManifest;
}

/** A pack with its content read off disk. Keeps its identity, unlike the assembled graph. */
export interface LoadedPack extends PackSource {
  id: string;
  entities: Map<string, Entity>;
  statements: Statement[];
  generators: Record<string, Generator>;
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
 * Order is fixed only so that failures and logs read the same way twice.
 * Assembly must not depend on it: load order silently inverted #38 once
 * already, when hand-written order became alphabetical order.
 */
export function discoverPacks(packsDir: URL = PACKS_DIR): PackSource[] {
  return readdirSync(packsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ dirName: entry.name, dir: new URL(`${entry.name}/`, packsDir) }))
    .filter(({ dir }) => existsSync(new URL(MANIFEST, dir)))
    .sort((a, b) => a.dirName.localeCompare(b.dirName))
    .map(({ dirName, dir }) => ({
      dirName,
      dir,
      manifest: JSON.parse(readFileSync(new URL(MANIFEST, dir), "utf8")) as PackManifest,
    }));
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
 * known at compile time, so there is nothing to `import` statically. Nothing is
 * checked here; checking is `validatePacks`, which needs every pack at once.
 */
export async function loadPack(source: PackSource): Promise<LoadedPack> {
  const entities = new Map(readJsonl<Entity>(ENTITIES, source.dir).map((e) => [e.id, e]));
  // `pack` is stamped here rather than authored: this is the one moment a
  // statement and the manifest it came from are both in hand. On-disk rows stay
  // free of a field that would only ever repeat the directory they sit in.
  const statements = readJsonl<Omit<Statement, "pack">>(STATEMENTS, source.dir).map(
    (statement): Statement => ({ ...statement, pack: source.manifest.id }),
  );

  const generatorModule = new URL(GENERATORS, source.dir);
  const generators = existsSync(generatorModule)
    ? (((await import(generatorModule.href)) as GeneratorModule).generators ?? {})
    : {};

  return { ...source, id: source.manifest.id, entities, statements, generators };
}

/**
 * Assembles validated packs into the one graph the engine reads.
 *
 * Every field is derived from the registry rather than merged pack-by-pack.
 * That is the structural fix for #38: generators used to be combined with
 * `Object.assign`, so two packs claiming one relation resolved by load order,
 * silently. Now a relation has exactly one owner by the time we get here, and
 * `validatePacks` has already refused anything else — so there is no merge
 * step left to get wrong.
 *
 * `hiddenSlots` reaches the graph here too (#34). It used to be dropped in
 * assembly, which meant a pack could declare a bidirectional relation and be
 * quizzed one way forever, with nothing erroring and every test still green.
 */
export function assembleGraph(packs: LoadedPack[], registry: RelationRegistry): Pack {
  const entities = new Map<string, Entity>();
  const statements: Statement[] = [];
  const sources = new Map<string, PackInfo>();
  for (const pack of packs) {
    for (const [id, entity] of pack.entities) entities.set(id, entity);
    statements.push(...pack.statements);
    // A pack's identity is the one thing assembly must not dissolve: it is what
    // a question's eyebrow reads, and later what a pack filter keys on (#20).
    sources.set(pack.id, { id: pack.id, labels: pack.manifest.labels });
  }

  const generators: Record<string, Generator> = {};
  const hiddenSlots: Record<string, HiddenSlot[]> = {};
  const byId = new Map(packs.map((p) => [p.id, p]));
  for (const [relationId, relation] of registry) {
    const generator = byId.get(relation.packId)?.generators[relationId];
    // Unreachable: the validator refuses a declaration with no generator. The
    // throw is here so a future caller that skips validation fails loudly
    // rather than assembling a graph with a hole in it.
    if (!generator) throw new Error(`relation ${relationId} (${relation.packId}) has no generator`);
    generators[relationId] = generator;
    hiddenSlots[relationId] = relation.hiddenSlots;
  }

  // Written as a whole object rather than mutated into shape, so adding a field
  // to `Pack` is a type error here rather than a field that silently never gets
  // populated — which is exactly how `hiddenSlots` went missing (#34).
  const graph: Required<Pack> = { entities, statements, generators, hiddenSlots, packs: sources };
  return graph;
}

/**
 * Discovers, loads, validates and assembles every pack into the single graph
 * the server serves. The server's one call to build its content.
 *
 * Validation failures throw and are not caught: boot fails hard rather than
 * skipping a bad pack, because a warning in a scrollback is how a pack quietly
 * stops being quizzed.
 */
export async function loadAllPacks(packsDir: URL = PACKS_DIR): Promise<Pack> {
  const packs = await Promise.all(discoverPacks(packsDir).map(loadPack));
  return assembleGraph(packs, validatePacks(packs));
}
