import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { questionResponseSchema } from "@geo/contract";
import type { Entity, Generator, Pack, Statement } from "@geo/engine";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { assembleGraph, loadAllPacks, loadTranche } from "./pack-loader.js";
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

// One tranche owns the entities (Tokyo, Japan); a second tranche ships only a
// statement over them, with its own relation and id prefix — the shape the real
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

describe("assembleGraph", () => {
  it("takes entities from the tranche that owns them", () => {
    const merged = assembleGraph([entityOwner, statementsOnly]);
    expect(merged.entities.size).toBe(2);
    expect(merged.entities.get("Q17")?.labels.en).toBe("Japan");
  });

  it("concatenates statements from every tranche in order", () => {
    const merged = assembleGraph([entityOwner, statementsOnly]);
    expect(merged.statements.map((s) => s.id)).toEqual(["cc:tokyo", "cap:tokyo"]);
  });

  it("merges per-tranche generators into one relation→generator table", () => {
    const merged = assembleGraph([entityOwner, statementsOnly]);
    expect(Object.keys(merged.generators).sort()).toEqual(["capital_of", "located_in"]);
  });

  it("resolves a statement-only tranche's statement against the entity owner", () => {
    const merged = assembleGraph([entityOwner, statementsOnly]);
    const capital = merged.statements.find((s) => s.id === "cap:tokyo");
    expect(merged.entities.get(capital?.subject ?? "")?.labels.en).toBe("Tokyo");
  });

  it("rejects an entity owned by more than one tranche instead of unioning", () => {
    expect(() => assembleGraph([entityOwner, entityOwner])).toThrow(/owned by more than one tranche/);
  });
});

describe("loadTranche", () => {
  let dir: string;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("loads a statement-only tranche off disk, with no entities of its own", () => {
    dir = mkdtempSync(join(tmpdir(), "geo-tranche-"));
    writeFileSync(
      join(dir, "statements.jsonl"),
      `${JSON.stringify({ id: "cap:tokyo", subject: "Q1490", relation: "capital_of", object: { kind: "entity", id: "Q17" } })}\n`,
    );
    // No entities.jsonl written — the tranche owns none.
    const loaded = loadTranche({ packDir: pathToFileURL(`${dir}/`), generators: { capital_of: capitalOf } });
    expect(loaded.entities.size).toBe(0);
    expect(loaded.statements.map((s) => s.id)).toEqual(["cap:tokyo"]);
    expect(loaded.generators.capital_of).toBeTypeOf("function");
  });
});

describe("two-tranche graph over the server seam", () => {
  const memoryStore = () => createAnswerStore(openDatabase(":memory:"));

  it("interweaves questions from both tranches over one graph", async () => {
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

describe("loadAllPacks", () => {
  it("assembles the shipped tranches into one graph with core-geo as sole entity owner", () => {
    const p = loadAllPacks();
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

  it("includes continental-countries pack with country→continent statements", () => {
    const p = loadAllPacks();

    // continental-countries ships statements for every country in core-geo
    const franceStatement = p.statements.find((s) => s.id === "cc:france");
    expect(franceStatement).toBeDefined();
    expect(franceStatement?.subject).toBe("Q42");
    expect(franceStatement?.relation).toBe("located_in");
    expect(franceStatement?.object).toEqual({ kind: "entity", id: "Q46" });

    // Verify France (Q42) and Europe (Q46) are both in core-geo
    expect(p.entities.get("Q42")?.labels.en).toBe("France");
    expect(p.entities.get("Q46")?.labels.en).toBe("Europe");

    // continental-countries interweaves with other tranches: 150+ continent questions
    const continentQuestions = p.statements.filter((s) => s.id?.startsWith("cc:") && s.relation === "located_in");
    expect(continentQuestions.length).toBeGreaterThanOrEqual(150);
  });
});
