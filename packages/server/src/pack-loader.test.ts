import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { questionResponseSchema } from "@geo/contract";
import type { Entity, Generator, Pack, Statement } from "@geo/engine";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { assembleGraph, discoverPacks, loadAllPacks, loadPack } from "./pack-loader.js";
import { createAnswerStore, openDatabase } from "./storage.js";

const locatedIn: Generator = ({ statement, graph }) => ({
  prompt: `What country is ${graph.getEntity(statement.subject).labels.en} in?`,
  input: "text",
});
const capitalOf: Generator = ({ statement, graph }) => ({
  prompt: `What country is ${graph.getEntity(statement.subject).labels.en} the capital of?`,
  input: "text",
});

function pack(entities: Entity[], statements: Statement[], generators: Record<string, Generator>): Pack {
  return { entities: new Map(entities.map((e) => [e.id, e])), statements, generators };
}

// One pack owns the entities (Tokyo, Japan); a second ships only a statement
// over them, with its own relation and id prefix — the shape the real
// single-owner assembly sees.
const entityOwner = pack(
  [
    { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] },
    { id: "Q17", labels: { en: "Japan" }, types: ["country"] },
  ],
  [{ id: "cc:tokyo", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" } }],
  { located_in: locatedIn },
);
const statementsOnly = pack(
  [],
  [{ id: "cap:tokyo", subject: "Q1490", relation: "capital_of", object: { kind: "entity", id: "Q17" } }],
  { capital_of: capitalOf },
);

/**
 * A throwaway `packs/`-shaped directory, created **inside the repo** rather
 * than in `os.tmpdir()`. A pack's `index.ts` is imported dynamically, and under
 * vitest that import goes through Vite's transform pipeline, which will not
 * touch TypeScript outside the project root. The real server runs under tsx and
 * has no such constraint; this is a harness limitation, not a loader one.
 */
function makeTempPacksDir(): string {
  return mkdtempSync(join(fileURLToPath(new URL(".", import.meta.url)), "..", "tmp-packs-"));
}

/**
 * Builds a throwaway `packs/`-shaped directory. Files are written only where a
 * test asks for them, because "each file is optional" is the property under
 * test — an entities-only pack has no `index.ts`, a statement-only pack has no
 * `entities.jsonl`.
 */
function writePack(
  packsDir: string,
  id: string,
  files: { manifest?: object | null; entities?: object[]; statements?: object[]; indexTs?: string },
): void {
  const dir = join(packsDir, id);
  mkdirSync(dir, { recursive: true });
  if (files.manifest !== null) {
    writeFileSync(join(dir, "pack.json"), JSON.stringify(files.manifest ?? { id, version: "0.0.1", labels: { en: id } }));
  }
  if (files.entities) writeFileSync(join(dir, "entities.jsonl"), `${files.entities.map((e) => JSON.stringify(e)).join("\n")}\n`);
  if (files.statements) writeFileSync(join(dir, "statements.jsonl"), `${files.statements.map((s) => JSON.stringify(s)).join("\n")}\n`);
  if (files.indexTs) writeFileSync(join(dir, "index.ts"), files.indexTs);
}

describe("assembleGraph", () => {
  it("takes entities from the pack that owns them", () => {
    const merged = assembleGraph([entityOwner, statementsOnly]);
    expect(merged.entities.size).toBe(2);
    expect(merged.entities.get("Q17")?.labels.en).toBe("Japan");
  });

  it("concatenates statements from every pack in order", () => {
    const merged = assembleGraph([entityOwner, statementsOnly]);
    expect(merged.statements.map((s) => s.id)).toEqual(["cc:tokyo", "cap:tokyo"]);
  });

  it("merges per-pack generators into one relation→generator table", () => {
    const merged = assembleGraph([entityOwner, statementsOnly]);
    expect(Object.keys(merged.generators).sort()).toEqual(["capital_of", "located_in"]);
  });

  it("resolves a statement-only pack's statement against the entity owner", () => {
    const merged = assembleGraph([entityOwner, statementsOnly]);
    const capital = merged.statements.find((s) => s.id === "cap:tokyo");
    expect(merged.entities.get(capital?.subject ?? "")?.labels.en).toBe("Tokyo");
  });

  it("rejects an entity owned by more than one pack instead of unioning", () => {
    expect(() => assembleGraph([entityOwner, entityOwner])).toThrow(/owned by more than one pack/);
  });
});

describe("discoverPacks", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("finds every directory holding a pack.json, and reads the manifest", () => {
    dir = makeTempPacksDir();
    writePack(dir, "alpha", { manifest: { id: "alpha", version: "1.0.0", labels: { en: "Alpha" } } });
    writePack(dir, "beta", { manifest: { id: "beta", version: "0.0.1", labels: { en: "Beta" } } });

    const found = discoverPacks(pathToFileURL(`${dir}/`));
    expect(found.map((p) => p.manifest.id)).toEqual(["alpha", "beta"]);
    expect(found[0]?.manifest.labels.en).toBe("Alpha");
  });

  it("is deterministic: directory-name order, whatever the filesystem returns", () => {
    dir = makeTempPacksDir();
    for (const id of ["zulu", "alpha", "mike"]) writePack(dir, id, {});

    expect(discoverPacks(pathToFileURL(`${dir}/`)).map((p) => p.manifest.id)).toEqual(["alpha", "mike", "zulu"]);
  });

  it("skips a directory with no pack.json — build output is not content", () => {
    dir = makeTempPacksDir();
    writePack(dir, "real", {});
    mkdirSync(join(dir, "dist"), { recursive: true });
    writeFileSync(join(dir, "dist", "leftover.js"), "// not a pack");

    expect(discoverPacks(pathToFileURL(`${dir}/`)).map((p) => p.manifest.id)).toEqual(["real"]);
  });
});

describe("loadPack", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("loads a statement-only pack, with no entities and no generator module", async () => {
    dir = makeTempPacksDir();
    writePack(dir, "statements-only", {
      statements: [{ id: "cap:tokyo", subject: "Q1490", relation: "capital_of", object: { kind: "entity", id: "Q17" } }],
    });

    const [source] = discoverPacks(pathToFileURL(`${dir}/`));
    const loaded = await loadPack(source!);
    expect(loaded.entities.size).toBe(0);
    expect(loaded.statements.map((s) => s.id)).toEqual(["cap:tokyo"]);
    expect(loaded.generators).toEqual({});
  });

  it("loads an entities-only pack — no statements.jsonl, no index.ts", async () => {
    dir = makeTempPacksDir();
    writePack(dir, "entities-only", { entities: [{ id: "Q17", labels: { en: "Japan" }, types: ["country"] }] });

    const [source] = discoverPacks(pathToFileURL(`${dir}/`));
    const loaded = await loadPack(source!);
    expect(loaded.entities.get("Q17")?.labels.en).toBe("Japan");
    expect(loaded.statements).toEqual([]);
    expect(loaded.generators).toEqual({});
  });

  it("imports generators from index.ts when the pack ships one", async () => {
    dir = makeTempPacksDir();
    writePack(dir, "with-code", {
      statements: [{ id: "x:1", subject: "Q1490", relation: "capital_of", object: { kind: "entity", id: "Q17" } }],
      indexTs: `export const generators = { capital_of: () => ({ prompt: "generated", input: "text" }) };\n`,
    });

    const [source] = discoverPacks(pathToFileURL(`${dir}/`));
    const loaded = await loadPack(source!);
    expect(loaded.generators.capital_of).toBeTypeOf("function");
  });
});

describe("adding a pack touches nothing outside its own directory", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // The point of ADR-0001, asserted directly: a pack that no source file
  // mentions, that is in no dependency list and no tsconfig, is picked up and
  // quizzed purely because its directory exists.
  it("discovers, loads and serves a pack the application source has never heard of", async () => {
    dir = makeTempPacksDir();
    writePack(dir, "core", {
      entities: [
        { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] },
        { id: "Q17", labels: { en: "Japan" }, types: ["country"] },
      ],
    });
    writePack(dir, "newcomer", {
      statements: [{ id: "new:tokyo", subject: "Q1490", relation: "capital_of", object: { kind: "entity", id: "Q17" } }],
      indexTs: `export const generators = {
        capital_of: ({ statement, graph }) => ({
          prompt: \`What country is \${graph.getEntity(statement.subject).labels.en} the capital of?\`,
          input: "text",
        }),
      };\n`,
    });

    const graph = await loadAllPacks(pathToFileURL(`${dir}/`));
    const res = await createApp({
      pack: graph,
      store: createAnswerStore(openDatabase(":memory:")),
      rng: () => 0,
    }).request("/question");

    expect(questionResponseSchema.parse(await res.json())).toEqual({
      cardId: "new:tokyo:object",
      prompt: "What country is Tokyo the capital of?",
      input: "text",
    });
  });
});

describe("two-pack graph over the server seam", () => {
  const memoryStore = () => createAnswerStore(openDatabase(":memory:"));

  it("interweaves questions from both packs over one graph", async () => {
    const merged = assembleGraph([entityOwner, statementsOnly]);

    // rng=0 lands on the first (located_in) statement, rng≈1 on the last (capital_of).
    const first = questionResponseSchema.parse(
      await (await createApp({ pack: merged, store: memoryStore(), rng: () => 0 }).request("/question")).json(),
    );
    const last = questionResponseSchema.parse(
      await (
        await createApp({ pack: merged, store: memoryStore(), rng: () => 0.999 }).request("/question")
      ).json(),
    );

    expect(first).toEqual({
      cardId: "cc:tokyo:object",
      prompt: "What country is Tokyo in?",
      input: "text",
    });
    expect(last).toEqual({
      cardId: "cap:tokyo:object",
      prompt: "What country is Tokyo the capital of?",
      input: "text",
    });
  });
});

describe("loadAllPacks over the packs actually shipped", () => {
  it("discovers all three shipped packs by scanning, with no list in source", async () => {
    expect(discoverPacks().map((p) => p.manifest.id)).toEqual([
      "continental-countries",
      "core-cities",
      "core-geo",
    ]);
  });

  it("assembles them into one graph with core-geo as sole entity owner", async () => {
    const p = await loadAllPacks();
    expect(p.statements.length).toBeGreaterThan(0);
    expect(p.generators.located_in).toBeTypeOf("function");

    // core-geo owns the entities: continents are first-class, and core-cities'
    // statements resolve against core-geo (it ships none of its own).
    expect(p.entities.get("Q46")?.labels.en).toBe("Europe");
    expect(p.entities.get("Q46")?.types).toContain("continent");

    // The São Paulo statement points at Q174 (São Paulo), not the old wrong
    // Q1963 (which is Khartoum, kept in core-geo as Sudan's capital).
    const saoPaulo = p.statements.find((s) => s.id === "cc:saopaulo-brazil");
    expect(p.entities.get(saoPaulo?.subject ?? "")?.labels.en).toBe("São Paulo");
    expect(p.entities.get("Q1963")?.labels.en).toBe("Khartoum");
  });

  it("includes continental-countries pack with country→continent statements", async () => {
    const p = await loadAllPacks();

    // continental-countries ships statements for every country in core-geo.
    // France is Q142 — this assertion said Q42 (Douglas Adams), a Q-ID core-geo
    // does not contain at all, so it had been failing since it was written.
    const franceStatement = p.statements.find((s) => s.id === "cc:france");
    expect(franceStatement).toBeDefined();
    expect(franceStatement?.subject).toBe("Q142");
    expect(franceStatement?.relation).toBe("located_in");
    expect(franceStatement?.object).toEqual({ kind: "entity", id: "Q46" });

    // Verify France (Q142) and Europe (Q46) are both in core-geo
    expect(p.entities.get("Q142")?.labels.en).toBe("France");
    expect(p.entities.get("Q46")?.labels.en).toBe("Europe");

    // continental-countries interweaves with other packs: 150+ continent questions
    const continentQuestions = p.statements.filter((s) => s.id?.startsWith("cc:") && s.relation === "located_in");
    expect(continentQuestions.length).toBeGreaterThanOrEqual(150);
  });
});
