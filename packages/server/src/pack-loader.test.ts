import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { questionResponseSchema } from "@geo/contract";
import {
  checkAnswer,
  type Entity,
  type Generator,
  generateQuestion,
  type HiddenSlot,
  makeCardId,
  type Statement,
} from "@geo/engine";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { assembleGraph, assembleLoaded, discoverPacks, type LoadedPack, loadAllPacks, loadPack } from "./pack-loader.js";
import { validatePacks } from "./pack-validator.js";
import { createAnswerStore, openDatabase } from "./storage.js";

const locatedIn: Generator = ({ statement, graph }) => ({
  prompt: `What country is ${graph.getEntity(statement.subject).labels.en} in?`,
  input: "text",
});
const capitalOf: Generator = ({ statement, graph }) => ({
  prompt: `What country is ${graph.getEntity(statement.subject).labels.en} the capital of?`,
  input: "text",
});

/**
 * A pack as `loadPack` would have returned it. Statements are given without a
 * `pack` field and stamped here, exactly as the real loader stamps them — so a
 * fixture cannot claim provenance its pack doesn't have.
 */
function loadedPack(
  id: string,
  entities: Entity[],
  statements: Omit<Statement, "pack">[],
  relations: Record<string, { generator: Generator; hiddenSlots?: HiddenSlot[] }>,
): LoadedPack {
  return {
    id,
    dirName: id,
    dir: new URL(`file:///packs/${id}/`),
    manifest: {
      id,
      version: "0.0.1",
      labels: { en: id },
      relations: Object.fromEntries(
        Object.entries(relations).map(([r, { hiddenSlots }]) => [r, { labels: { en: r }, hiddenSlots }]),
      ),
    },
    entities: new Map(entities.map((e) => [e.id, e])),
    statements: statements.map((statement) => ({ ...statement, pack: id })),
    generators: Object.fromEntries(Object.entries(relations).map(([r, { generator }]) => [r, generator])),
  };
}

/** Assemble the way the loader does: validate first, then build from the registry. */
function assemble(packs: LoadedPack[]) {
  return assembleGraph(packs, validatePacks(packs));
}

// One pack owns the entities (Tokyo, Japan); a second ships only a statement
// over them, with its own relation and id prefix — the shape the real
// single-owner assembly sees.
const entityOwner = loadedPack(
  "owner",
  [
    { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] },
    { id: "Q17", labels: { en: "Japan" }, types: ["country"] },
  ],
  [{ id: "cc:tokyo", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" } }],
  { located_in: { generator: locatedIn } },
);
const statementsOnly = loadedPack(
  "statements-only",
  [],
  [{ id: "cap:tokyo", subject: "Q1490", relation: "capital_of", object: { kind: "entity", id: "Q17" } }],
  { capital_of: { generator: capitalOf } },
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

// The one assembly entry both load paths share: the fs loader (loadAllPacks)
// and the build-time bundle (packs.generated.ts) each call assembleLoaded, so a
// bundled graph is assembled identically to the on-disk one. It validates then
// assembles — the whole non-IO tail of loading in one named seam.
describe("assembleLoaded", () => {
  it("validates and assembles loaded packs into one graph", () => {
    const graph = assembleLoaded([entityOwner, statementsOnly]);
    expect(graph.entities.get("Q17")?.labels.en).toBe("Japan");
    expect(graph.statements.map((s) => s.id)).toEqual(["cc:tokyo", "cap:tokyo"]);
    expect(Object.keys(graph.generators).sort()).toEqual(["capital_of", "located_in"]);
  });

  it("refuses an invalid set the way validation does, rather than assembling a hole", () => {
    // A statement whose relation no pack declares: validation must throw here,
    // proving assembleLoaded runs the validator and does not silently assemble.
    const undeclared = loadedPack("undeclared", [], [
      { id: "x:1", subject: "Q1490", relation: "no_such_relation", object: { kind: "entity", id: "Q17" } },
    ], {});
    expect(() => assembleLoaded([entityOwner, undeclared])).toThrow(/no pack declares/);
  });
});

describe("assembleGraph", () => {
  it("takes entities from the pack that owns them", () => {
    const merged = assemble([entityOwner, statementsOnly]);
    expect(merged.entities.size).toBe(2);
    expect(merged.entities.get("Q17")?.labels.en).toBe("Japan");
  });

  it("concatenates statements from every pack in order", () => {
    const merged = assemble([entityOwner, statementsOnly]);
    expect(merged.statements.map((s) => s.id)).toEqual(["cc:tokyo", "cap:tokyo"]);
  });

  it("builds one relation→generator table from the registry", () => {
    const merged = assemble([entityOwner, statementsOnly]);
    expect(Object.keys(merged.generators).sort()).toEqual(["capital_of", "located_in"]);
  });

  it("resolves a statement-only pack's statement against the entity owner", () => {
    const merged = assemble([entityOwner, statementsOnly]);
    const capital = merged.statements.find((s) => s.id === "cap:tokyo");
    expect(merged.entities.get(capital?.subject ?? "")?.labels.en).toBe("Tokyo");
  });

  // #34: hidden slots used to be dropped here, so a pack could declare a
  // bidirectional relation and be quizzed one way forever, silently.
  it("carries each relation's hidden slots into the assembled graph", () => {
    const bidi = loadedPack(
      "capitals",
      [],
      [{ id: "cap:ch", subject: "Q17", relation: "capital", object: { kind: "entity", id: "Q1490" } }],
      { capital: { generator: capitalOf, hiddenSlots: ["object", "subject"] } },
    );
    const merged = assemble([entityOwner, bidi]);
    expect(merged.hiddenSlots?.capital).toEqual(["object", "subject"]);
  });

  it("gives a relation that declares no slots the object-hidden default", () => {
    expect(assemble([entityOwner]).hiddenSlots?.located_in).toEqual(["object"]);
  });

  it("keeps slots from two packs declaring different relations", () => {
    const merged = assemble([entityOwner, statementsOnly]);
    expect(Object.keys(merged.hiddenSlots ?? {}).sort()).toEqual(["capital_of", "located_in"]);
  });

  // The general form of the #34 bug: assembly silently dropping a field of the
  // graph shape. Building the result as a `Required<Pack>` object literal makes
  // a new field a type error rather than a field that never gets populated.
  it("populates every field of the assembled graph shape", () => {
    const merged = assemble([entityOwner, statementsOnly]);
    expect(Object.keys(merged).sort()).toEqual([
      "entities",
      "generators",
      "hiddenSlots",
      "packs",
      "statements",
    ]);
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

  // #40: provenance is stamped at load, off the manifest, not authored on disk
  // and not inferred later from the statement id.
  it("stamps each statement with the id of the pack it was read from", async () => {
    dir = makeTempPacksDir();
    writePack(dir, "stamped", {
      statements: [{ id: "cc:tokyo", subject: "Q1490", relation: "capital_of", object: { kind: "entity", id: "Q17" } }],
    });

    const [source] = discoverPacks(pathToFileURL(`${dir}/`));
    const loaded = await loadPack(source!);
    expect(loaded.statements[0]?.pack).toBe("stamped");
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
      manifest: {
        id: "newcomer",
        version: "0.0.1",
        labels: { en: "Newcomer" },
        relations: { capital_of: { labels: { en: "is the capital of" } } },
      },
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
      packId: "newcomer",
      packLabel: "Newcomer",
      answerTypes: ["country"],
    });
  });
});

describe("two-pack graph over the server seam", () => {
  const memoryStore = () => createAnswerStore(openDatabase(":memory:"));

  it("interweaves questions from both packs over one graph", async () => {
    const merged = assemble([entityOwner, statementsOnly]);
    const app = createApp({ pack: merged, store: memoryStore() });

    // A pass is without replacement, so two draws exhaust this two-card graph
    // and must yield one question from each pack — that is what interweaving
    // means. Which order they arrive in is the shuffle's business.
    const first = questionResponseSchema.parse(await (await app.request("/question")).json());
    const second = questionResponseSchema.parse(await (await app.request("/question")).json());

    expect([first.packId, second.packId].sort()).toEqual(["owner", "statements-only"]);
    expect([first.cardId, second.cardId].sort()).toEqual(["cap:tokyo:object", "cc:tokyo:object"]);
  });

  // The #40 regression, stated as the condition that broke it: two packs whose
  // statement ids share a prefix. The UI used to read the prefix, so the pack
  // with more statements labelled the other's questions too. Nothing enforces
  // prefix uniqueness — provenance must not depend on it.
  it("labels two packs sharing a statement-id prefix distinctly", () => {
    const cities = loadedPack(
      "core-cities",
      [
        { id: "Q1490", labels: { en: "Tokyo" }, types: ["city"] },
        { id: "Q17", labels: { en: "Japan" }, types: ["country"] },
      ],
      [{ id: "cc:tokyo", subject: "Q1490", relation: "located_in", object: { kind: "entity", id: "Q17" } }],
      { located_in: { generator: locatedIn } },
    );
    const continents = loadedPack(
      "continental-countries",
      [],
      [{ id: "cc:japan", subject: "Q17", relation: "on_continent", object: { kind: "entity", id: "Q1490" } }],
      { on_continent: { generator: capitalOf } },
    );

    const merged = assemble([cities, continents]);
    const labels = merged.statements.map((s) => generateQuestion(merged, s, "object").packLabel);
    expect(labels).toEqual(["core-cities", "continental-countries"]);
  });
});

describe("boot fails hard on an invalid pack", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  // Skipping a bad pack with a warning was considered and rejected: a warning
  // in a scrollback is how a pack quietly stops being quizzed (ADR-0001).
  it("refuses to load when two packs declare the same relation — #38, caught this time", async () => {
    dir = makeTempPacksDir();
    writePack(dir, "core", { entities: [{ id: "Q17", labels: { en: "Japan" }, types: ["country"] }] });
    for (const id of ["cities", "continents"]) {
      writePack(dir, id, {
        manifest: { id, version: "0.0.1", labels: { en: id }, relations: { located_in: { labels: { en: "in" } } } },
        indexTs: `export const generators = { located_in: () => ({ prompt: "x", input: "text" }) };\n`,
      });
    }

    await expect(loadAllPacks(pathToFileURL(`${dir}/`))).rejects.toThrow(
      /relation "located_in" is declared by both "cities" and "continents"/,
    );
  });

  it("refuses to load a statement whose relation no pack declares", async () => {
    dir = makeTempPacksDir();
    writePack(dir, "core", { entities: [{ id: "Q17", labels: { en: "Japan" }, types: ["country"] }] });
    writePack(dir, "orphan", {
      statements: [{ id: "o:1", subject: "Q17", relation: "mystery", object: { kind: "entity", id: "Q17" } }],
    });

    await expect(loadAllPacks(pathToFileURL(`${dir}/`))).rejects.toThrow(/relation "mystery", which no pack declares/);
  });
});

describe("loadAllPacks over the packs actually shipped", () => {
  it("discovers all shipped packs by scanning, with no list in source", async () => {
    expect(discoverPacks().map((p) => p.manifest.id)).toEqual([
      "capital-cities",
      "continental-countries",
      "core-cities",
      "core-geo",
      "currencies",
      "official-languages",
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
    // Its own relation id, not core-cities' city→country `located_in` (#38).
    expect(franceStatement?.relation).toBe("located_in_continent");
    expect(franceStatement?.object).toEqual({ kind: "entity", id: "Q46" });

    // Verify France (Q142) and Europe (Q46) are both in core-geo
    expect(p.entities.get("Q142")?.labels.en).toBe("France");
    expect(p.entities.get("Q46")?.labels.en).toBe("Europe");

    // continental-countries interweaves with other packs: 150+ continent questions
    const continentQuestions = p.statements.filter((s) => s.relation === "located_in_continent");
    expect(continentQuestions.length).toBeGreaterThanOrEqual(150);
  });

  it("includes the currencies pack, quizzed object-hidden with any-of grading", async () => {
    const p = await loadAllPacks();

    // The currencies pack owns its currency entities (core-geo owns none).
    expect(p.entities.get("Q4916")?.labels.en).toBe("euro");
    expect(p.entities.get("Q4916")?.types).toContain("currency");

    // France → euro. Object-hidden render must not leak the answer.
    const france = p.statements.find((s) => s.id === "cur:france:euro");
    expect(france).toBeDefined();
    expect(france?.relation).toBe("official_currency");
    expect(france?.object).toEqual({ kind: "entity", id: "Q4916" });
    const q = generateQuestion(p, france!, "object");
    expect(q.prompt).toBe("What currency does France use?");
    expect(q.prompt.toLowerCase()).not.toContain("euro");

    // Grades the currency name correct (case/alias-insensitive).
    const franceCard = makeCardId(france!.id, "object");
    expect(checkAnswer(p, franceCard, "Euro").correct).toBe(true);
    expect(checkAnswer(p, franceCard, "EUR").correct).toBe(true);

    // A country with two legal tenders accepts either — any-of over the pair.
    // France also has the CFP franc (Q214393) via its overseas territories.
    expect(p.statements.find((s) => s.id === "cur:france:cfp-franc")).toBeDefined();
    expect(checkAnswer(p, franceCard, "CFP franc").correct).toBe(true);
  });
});
